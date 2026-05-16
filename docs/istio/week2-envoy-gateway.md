---
tags:
  - Istio
  - Envoy
---

# Envoy, Istio Gateway

> Envoy 프록시의 내부 동작 원리와 Istio Gateway를 활용한 트래픽 진입점 구성 방법을 정리한다.

엔보이(Envoy)는 분산 시스템에서 발생하는 애플리케이션 네트워킹 문제를 해결하기 위해 설계된 고성능 L7 프록시이다. 이스티오는 엔보이를 데이터 플레인으로 활용하여 서비스 메시의 트래픽 제어, 관찰 가능성, 보안 기능을 제공한다.

## What is the Envoy proxy?

엔보이는 분산 시스템을 구축할 때 발생하는 어려운 애플리케이션 네트워킹 문제를 해결하고자 [리프트](https://www.lyft.com/)가 개발했다. 2016년 9월 오픈소스 프로젝트로 공개됐으며, 1년 후인 2017년 9월에는 CNCF에 합류했다. 엔보이는 C++로 작성됐으며, 높은 부하에서도 안정적이고 결정론적으로 동작하도록 성능을 극대화하는 것을 목표로 한다.

프록시란 클라이언트와 서버 간 통신의 중간에 위치한 네트워크 아키텍처의 중개 구성 요소이다. 중간에 위치함으로써 보안, 프라이버시, 정책 같은 기능을 추가할 수 있고, 클라이언트가 서비스와 통신할 때 알아야 할 사항을 단순화할 수 있다. 예를 들어 서비스가 동일한 인스턴스 집합(클러스터)으로 구현된 경우, 프록시가 단일 식별자 혹은 IP 주소를 갖고 중간에 위치하면 클라이언트는 서비스 인스턴스들과 통신하는 데 프록시를 사용할 수 있다.

이런 리버스 프록시는 클러스터의 인스턴스 상태를 검사하고 실패하거나 오동작하는 백엔드 인스턴스를 우회하도록 라우팅한다. 이 방식으로 프록시는 클라이언트가 어느 백엔드가 과부하 상태이거나 장애가 발생했는지 파악할 필요가 없도록 보호한다.

엔보이 프록시는 서비스 디스커버리, 로드 밸런싱, 헬스 체크 같은 기능을 제공하기 위해 애플리케이션 요청 경로 중간에 삽입할 수 있는 애플리케이션 수준 프록시이며, 그 이상을 수행한다. 엔보이는 애플리케이션이 다른 서비스와 통신할 때 사용하는 7계층 프로토콜을 이해할 수 있다. 예를 들어 HTTP 1.1, HTTP 2, gRPC 등을 이해하고 요청 수준 타임아웃, 재시도, 재시도별 타임아웃, 서킷 브레이커 같은 복원력 기능을 추가할 수 있다. 커넥션 수준(L3/L4) 프록시로는 이와 같은 작업을 수행할 수 없다.

엔보이는 기본 제공 프로토콜 외에도 다양한 프로토콜을 이해하도록 확장할 수 있다. MongoDB, DynamoDB 같은 데이터베이스용, AMQP 같은 비동기 프로토콜용 필터도 작성돼 왔다. 또한 애플리케이션 트래픽이 엔보이를 거쳐 흐르는 덕분에 통과하는 요청에 대한 텔레메트리를 수집할 수 있다. 예를 들어 요청 처리 소요 시간, 특정 서비스가 처리하는 요청 처리량, 서비스의 오류율 등이다.

프록시로서 엔보이는 애플리케이션 외부에서 동작함으로써 개발자가 네트워크 문제를 고려하지 않아도 되도록 설계됐다. 어느 프로그래밍 언어로 작성됐든, 어느 프레임워크를 사용하든 모든 애플리케이션이 이 기능들을 사용할 수 있다. 마이크로서비스든, 어떤 언어로 작성된 모놀리스 및 레거시 애플리케이션이든 엔보이가 이해할 수 있는 프로토콜(HTTP 등)을 사용하는 한 이점을 활용할 수 있다.

엔보이는 클러스터 에지 프록시, 서비스의 공유 프록시, 심지어는 이스티오처럼 서비스별 프록시로도 사용할 수 있다. 이스티오에서는 엔보이 프록시를 서비스 인스턴스당 하나씩 배포해 유연성, 성능, 제어 능력을 높인다. 엔보이는 서비스 메시의 진입점으로 사용돼 클러스터에 들어오는 트래픽을 완벽히 제어하고 관찰할 수 있다.

### Envoy의 핵심 기능

**Envoy 핵심 개념**

엔보이가 L7 트래픽에 수행하는 작업을 개념적으로 설명하면 다음 세 가지로 정리된다.

| 개념 | 설명 |
| --- | --- |
| 리스너(Listeners) | 애플리케이션이 연결할 수 있는 외부 세계로 포트를 노출한다. 예를 들어 포트 80에 대한 리스너는 트래픽을 받고 설정된 동작을 해당 트래픽에 적용한다. |
| 루트(Routes) | 리스너로 들어오는 트래픽을 처리하는 라우팅 규칙이다. 예를 들어 요청이 들어오고 `/catalog`에 일치하면 그 트래픽을 catalog 클러스터로 보내는 식이다. |
| 클러스터(Cluster) | 엔보이가 트래픽을 라우팅할 수 있는 특정 업스트림 서비스이다. 예를 들어 catalog-v1과 catalog-v2는 별도 클러스터일 수 있고, 루트는 catalog 서비스의 v1이나 v2로 트래픽을 보내는 방법에 대한 규칙을 지정할 수 있다. |

엔보이는 트래픽 방향성을 나타낼 때 다른 프록시와 비슷한 용어를 사용한다. 트래픽은 다운스트림 시스템에서 리스너로 들어오고, 엔보이의 클러스터 중 하나로 라우팅된다. 클러스터는 트래픽을 업스트림 시스템으로 보내는 역할을 한다.

**서비스 디스커버리**

클라이언트 측 서비스 디스커버리를 구현하기 위해 런타임별로 전용 라이브러리를 사용할 필요 없이, 엔보이는 서비스 디스커버리를 자동으로 수행할 수 있다. 엔보이가 디스커버리 API에서 서비스 엔드포인트를 찾도록 설정하기만 하면, 애플리케이션은 서비스 엔드포인트를 찾는 방법을 몰라도 된다. 디스커버리 API는 HashiCorp Consul, Apache ZooKeeper, Netflix Eureka 등 일반적인 서비스 디스커버리 API를 래핑하는 데 사용할 수 있는 단순한 REST API이다. 이스티오의 컨트롤 플레인은 이 API를 기본적으로 구현한다.

엔보이는 서비스 디스커버리 카탈로그의 업데이트가 궁극적으로는 일관성을 가질 것이라는 가정에 기반해 설계됐다. 분산 시스템에서는 통신할 모든 서비스의 정확한 상태와 사용 가능 여부를 실시간으로 파악할 수 없다. 따라서 할 수 있는 최선은 당면한 지식을 활용하고, 능동적이고 수동적인 헬스 체크를 수행하며, 그 결과들이 최선이 아닐 수 있음을 인식하는 것이다. 이스티오는 엔보이의 서비스 디스커버리 메커니즘 설정을 조절하는 고수준 리소스들을 제공함으로써 세부적인 내용 대부분을 추상화한다.

**로드 밸런싱**

엔보이는 애플리케이션이 활용할 수 있는 고급 로드 밸런싱 알고리듬을 여러 가지 구현하고 있다. 주목할 만한 기능 중 하나는 지역 인식(locality-aware) 로드 밸런싱이다. 엔보이는 특정 기준을 충족하지 않으면 트래픽이 지역 경계를 넘지 않게 해 트래픽을 더 잘 분산시킨다. 엔보이가 기본으로 제공하는 로드 밸런싱 알고리듬은 다음과 같다. ([Docs](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers))

| 알고리듬 | 설명 |
| --- | --- |
| 랜덤(Random) | 무작위 선택 |
| (가중치) 라운드 로빈 | 순서대로 순환하며 가중치 적용 가능 |
| 가중치를 적용한 최소 요청 | 요청 수가 가장 적은 엔드포인트 선택 |
| 일관된 해싱(Ring hash, Maglev) | 고정적인 sticky 라우팅 |

**트래픽 및 요청 라우팅**

엔보이는 HTTP 1.1과 HTTP 2 같은 애플리케이션 프로토콜을 이해할 수 있으므로 정교한 라우팅 규칙을 사용해 트래픽을 특정 백엔드 클러스터로 보낼 수 있다. 가상 호스트 매핑과 콘텍스트 경로(context-path) 라우팅 같은 기본적인 리버스 프록시 라우팅은 물론, 헤더 및 우선순위 기반 라우팅, 라우팅 재시도 및 타임아웃, 오류 주입까지도 수행할 수 있다. ([Docs](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http))

**트래픽 전환 및 섀도잉**

엔보이는 비율 기반(가중치 적용) 트래픽 분할/전환을 지원한다. 이 기능을 활용해 카나리 릴리스와 같이 위험을 완화하는 CD 기술을 사용할 수 있다.

엔보이는 트래픽의 사본을 만들어 '보내고 망각하는(fire and forget)' 방식으로 트래픽을 엔보이 클러스터에 섀도잉(shadowing)할 수도 있다. 업스트림 클러스터가 보는 요청은 라이브 트래픽의 복사본이므로, 라이브 운영 환경 트래픽에 영향을 주지 않고 서비스의 새 버전으로 라우팅할 수 있다. 고객에게 영향을 주지 않고 운영 환경 트래픽으로 서비스 변경 사항을 테스트할 수 있는 강력한 기능이다.

**네트워크 복원력**

엔보이에게 특정 종류의 복원력 문제를 맡길 수는 있지만, 그 파라미터를 설정하고 잘 조정하는 것은 애플리케이션의 책임이다. 엔보이는 요청 타임아웃과 요청 수준 재시도(재시도별 타임아웃 포함)를 자동으로 수행할 수 있다. 이런 재시도 동작은 네트워크 불안정이 간간히 요청에 영향을 줄 때 매우 유용하다. 반면에 재시도 증폭은 연쇄 장애로 이어질 수 있어 엔보이에서는 재시도 동작을 제한할 수 있다. 또한 애플리케이션 수준 재시도는 여전히 필요할 수 있으며 엔보이가 완전히 대체할 수 없다.

엔보이가 업스트림 클러스터를 호출할 때 진행 중인 커넥션 혹은 요청의 개수를 제한하고, 그 임계값을 넘어서는 것은 빠르게 실패시키도록 설정할 수 있다. 마지막으로 엔보이는 서킷 브레이커처럼 동작하는 이상값 감지(outlier detection)를 수행해 오동작하는 엔드포인트를 로드 밸런싱 풀에서 제거할 수 있다.

**HTTP/2 and gRPC**

HTTP/2는 단일 커넥션에서 여러 요청을 처리하고 서버 푸시, 스트리밍, 요청 백프레셔(backpressure)를 지원하도록 HTTP 프로토콜을 크게 개선한 버전이다. 엔보이는 처음부터 HTTP/1.1과 HTTP/2 프록시로 개발돼 다운스트림과 업스트림 모두에게 각 프로토콜을 프록시할 수 있다. 예를 들어 엔보이는 HTTP/1.1 커넥션을 받아 HTTP/2로 프록시하거나 그 반대도 가능하다. gRPC는 HTTP/2 위에서 구글 프로토콜 버퍼(Protobuf)를 사용하는 RPC 프로토콜로, 역시 엔보이가 기본적으로 지원한다. 이는 제대로 구현하기 어려운 기능이며 다른 서비스 프록시와 엔보이를 차별화한다. ([Docs](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http))

**메트릭 수집을 통한 관찰 가능성**

엔보이의 목표 중 하나는 네트워크를 이해할 수 있게 만드는 것이다. 이 목표를 위해 엔보이는 다양한 메트릭을 수집한다. 서버에 호출하는 다운스트림 시스템, 서버 그 자체, 서버가 요청을 보내는 업스트림 클러스터에 대한 여러 측면(dimension)을 추적한다. 엔보이의 통계는 카운터, 게이지, 히스토그램으로 추적된다.

| 통계 | 설명 |
| --- | --- |
| **downstream_cx_total** | 총 커넥션 개수 |
| **downstream_cx_http1_active** | 총 활성 HTTP/1.1 커넥션 개수 |
| **downstream_rq_http2_total** | 총 HTTP/2 요청 개수 |
| **cluster.\<name\>.upstream_cx_overflow** | 클러스터의 커넥션 서킷 브레이커가 임계값을 넘겨 발동한 횟수 |
| **cluster.\<name\>.upstream_rq_retry** | 총 요청 재시도 횟수 |
| **cluster.\<name\>.ejections_detected_consecutive_5xx** | 5xx 오류가 계속돼 퇴출된 횟수 (시행되지 않은 경우도 포함) |

엔보이는 설정 가능한 어댑터와 형식을 사용해 통계를 내보낼 수 있다. 기본적으로 지원하는 목록은 다음과 같다.

- StatsD
- Datadog (DogStatsD)
- Hystrix formatting
- Generic metrics service

**분산 트레이싱을 통한 관찰 가능성**

엔보이는 트레이스 스팬을 오픈트레이싱(OpenTracing) 엔진에 보고해 호출 그래프 내 트래픽 흐름, 홉, 지연 시간을 시각화할 수 있다. 특별한 오픈트레이싱 라이브러리를 설치할 필요가 없다. 한편 필요한 집킨 헤더를 전파하는 것은 애플리케이션의 역할이며, 이는 가벼운 래퍼(wrapper) 라이브러리로 수행할 수 있다.

엔보이는 서비스 간 호출을 연관시킬 목적으로 `x-request-id` 헤더를 생성하며, 트레이싱이 시작될 때 `x-b3-*` 헤더를 만들 수도 있다. 애플리케이션이 전파해야 하는 헤더는 다음과 같다.

- x-b3-traceid
- x-b3-spanid
- x-b3-parentspanid
- x-b3-sampled
- x-b3-flags

**자동 TLS 종료 및 시작**

엔보이는 특정 서비스로 향하는 TLS 트래픽을 종료(terminate)시킬 수 있다. 클러스터의 에지와 서비스 메시 내부의 프록시 모두에서 가능하다. 애플리케이션 대신 엔보이가 업스트림 클러스터로 TLS 트래픽을 시작할 수도 있다. 즉, 언어별 설정과 키스토어 또는 트러스트 스토어를 별도로 관리하지 않아도 된다. 요청 경로에 엔보이가 있으면 TLS, 심지어 mTLS까지도 자동으로 얻을 수 있다.

**속도 제한**

복원력의 중요한 측면은 보호받는 리소스로의 접근을 차단하거나 제한할 수 있는 기능이다. 데이터베이스나 캐시, 공유 서비스 같은 리소스들은 다음과 같은 이유로 보호받아야 한다.

- 호출 비용이 비쌈 (실행당 비용)
- 지연 시간이 길거나 예측 불가능
- 기아(starvation)를 방지하기 위해 공정성 알고리듬이 필요

특히 서비스가 재시도하도록 설정한 경우 시스템 내에서 특정 장애의 영향이 과도하게 확대될 수 있다. 이런 시나리오에서 요청을 제한하는 데 전역 속도 제한 서비스를 사용할 수 있다. 엔보이는 네트워크(커넥션별)와 HTTP(요청별) 수준 모두에서 속도 제한 서비스와 통합할 수 있다.

**엔보이 확장하기**

엔보이의 핵심은 프로토콜(7계층) 코덱(필터라고 부름)을 구축할 수 있는 바이트 처리 엔진이다. 엔보이에서는 추가 필터를 구축하는 것을 주요 사용 사례로 삼고 있으며, 이는 필요에 맞게 엔보이를 확장할 수 있는 방법이다. 엔보이 필터는 C++로 작성돼 엔보이의 바이너리로 컴파일된다. 또한 엔보이는 루아(Lua) 스크립트와 웹어셈블리(Wasm, WebAssembly)를 지원하므로 덜 침습적인(invasive) 방법으로도 엔보이 기능을 확장할 수 있다.

### 엔보이와 다른 프록시 비교

엔보이의 장점은 애플리케이션이나 서비스 프록시 역할을 한다는 데 있다. 프록시를 이용해 애플리케이션 간 통신을 원활하게 하며, 신뢰성 및 관찰 가능성 문제를 해결한다. 다른 프록시들은 로드 밸런서/웹 서버로 시작해 더 기능이 많고 성능이 뛰어난 프록시로 진화했으나, 일부 커뮤니티는 발전 속도가 느리거나 오픈소스가 아니어서 애플리케이션 간 통신에 사용할 수 있을 만큼 발전하는 데 오랜 시간이 걸렸다.

엔보이가 다른 프록시에 비해 특히 뛰어난 영역은 아래와 같다.

| 영역 | 설명 |
| --- | --- |
| 웹어셈블리를 통한 확장성 | WebAssembly를 통한 확장 지원 |
| 공개 커뮤니티 | 오픈 커뮤니티 기반 개발 |
| 모듈식 코드베이스 | 유지 보수 및 확장이 용이하도록 구축 |
| HTTP/2 지원 | 업스트림 및 다운스트림 모두 지원 |
| 심층 프로토콜 메트릭 수집 | 프로토콜 수준의 상세 메트릭 수집 |
| C++/가비지 수집 없음 | C++ 기반, 가비지 컬렉션 없음 |
| 동적 설정 | 핫 리스타트 없이 동적 구성 변경 가능 |

## Configuring Envoy

엔보이는 JSON/YAML 형식 설정 파일로 구동된다. 설정 파일은 리스너, 루트, 클러스터뿐 아니라 Admin API 활성화 여부, 액세스 로그 저장 위치, 트레이싱 엔진 설정 등 서버별 설정도 지정한다. 엔보이 설정에는 여러 버전이 있으며, 초기 버전인 v1과 v2는 v3로 대체돼 더 이상 사용하지 않는다. 이 문서에서는 v3 설정만을 살펴보겠다. 최신 버전이자 이스티오가 사용하는 버전이기 때문이다.

엔보이의 v3 설정 API는 gRPC를 사용한다. v3 API 구현자들은 API 호출 시 스트리밍 기능을 사용해 엔보이 프록시가 올바른 설정으로 수렴하는 데 걸리는 시간을 줄일 수 있다. 이렇게 하면 프록시가 주기적으로 폴링하는 대신 서버가 업데이트를 엔보이에 푸시할 수 있어 API를 폴링할 필요가 없어진다.

### 정적 설정

엔보이의 설정 파일을 이용해 리스너, 라우팅 규칙, 클러스터를 지정할 수 있다. 아래는 간단한 엔보이 설정이다.

```bash
static_resources:
  listeners: # (1) 리스너 정의
  - name: httpbin-demo
    address:
      socket_address: { address: 0.0.0.0, port_value: 15001 }
    filter_chains:
    - filters:
      - name:  envoy.filters.network.http_connection_manager # (2) HTTP 필터
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          stat_prefix: ingress_http
          http_filters:
          - name: envoy.filters.http.router
          route_config: # (3) 라우팅 규칙
            name: httpbin_local_route
            virtual_hosts:
            - name: httpbin_local_service
              domains: ["*"] # (4) 와일드카드 가상 호스트
              routes:
              - match: { prefix: "/" }
                route:
                  auto_host_rewrite: true
                  cluster: httpbin_service # (5) 클러스터로 라우팅
  clusters:
    - name: httpbin_service # (6) 업스트림 클러스터
      connect_timeout: 5s
      type: LOGICAL_DNS
      dns_lookup_family: V4_ONLY
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: httpbin
        endpoints:
        - lb_endpoints:
          - endpoint:
              address:
                socket_address:
                  address: httpbin
                  port_value: 8000
```

이 간단한 엔보이 설정 파일은 15001 포트에 소켓을 열고 필터 체인을 붙이는 리스너를 선언한다. 필터는 엔보이의 `http_connection_manager`에 라우팅 지시문을 설정한다. 이 예제의 간단한 라우팅 지시문은 와일드카드(`*`)로 모든 가상 호스트를 매칭하는 것으로, 모든 트래픽을 `httpbin_service` 클러스터로 라우팅한다.

설정의 마지막 부분은 `httpbin_service` 클러스터에 커넥션 속성을 정의한다. 이 예제는 업스트림 httpbin 서비스와 통신할 때 엔드포인트 서비스 디스커버리에 `LOGICAL_DNS`를, 로드 밸런싱 알고리듬으로 `ROUND_ROBIN`을 사용하도록 지정한다. ([Docs](https://www.envoyproxy.io/docs/envoy/v1.19.0/intro/arch_overview/upstream/service_discovery#arch-overview-service-discovery-types-logical-dns))

이 설정 파일은 들어오는 트래픽이 연결할 수 있는 리스너를 만들고, 모든 트래픽을 httpbin 클러스터로 라우팅한다. 또한 사용할 로드 밸런싱 설정과 커넥션 타임아웃 종류도 지정한다. 이 프록시를 호출하면 요청이 httpbin 서비스로 라우팅된다.

많은 설정이 명시적으로 지정돼 있음을 유의한다. 이 예시는 완전히 정적인 설정 파일이다. 엔보이 실습을 진행할 때는 정적 설정을 사용하겠지만, 먼저 동적 서비스를 살펴보고 엔보이가 어떻게 xDS API를 이용해 동적 설정을 하는지 알아보겠다.

### 동적 설정

엔보이는 특정 API군을 사용해 다운타임이나 재시작 없이 설정을 실시간으로 업데이트할 수 있다. 올바른 디스커버리 서비스 API를 가리키는 간단한 부트스트랩 설정 파일만 있으면 나머지 설정은 동적으로 이뤄진다. 엔보이는 동적 설정에 다음과 같은 API를 사용한다. ([Blog](https://www.anyflow.net/sw-engineer/istio-internals-by-xds))

| API | 설명 |
| --- | --- |
| **LDS** (Listener discovery service) | 엔보이가 어떤 리스너를 노출해야 하는지 쿼리할 수 있게 하는 API |
| **RDS** (Route discovery service) | 리스너 설정의 일부로, 사용할 루트를 지정한다. LDS의 부분집합이다. |
| **CDS** (Cluster discovery service) | 엔보이가 클러스터 목록과 각 클러스터용 설정을 찾을 수 있는 API |
| **EDS** (Endpoint discovery service) | 클러스터 설정의 일부로, 특정 클러스터에 어떤 엔드포인트를 사용해야 하는지 지정한다. CDS의 부분집합이다. |
| **SDS** (Secret discovery service) | 인증서를 배부하는 데 사용하는 API |
| **ADS** (Aggregate discovery service) | 나머지 API에 대한 모든 변경 사항을 직렬화된 스트림으로 제공한다. 이 API 하나로 모든 변경 사항을 순차적으로 가져올 수 있다. |

이 API들을 통틀어 xDS 서비스라고 부른다. 이들 중 하나 이상을 조합해 설정할 수 있으며, 전부 사용해야만 하는 것은 아니다.

한 가지 유념해야 할 점은 엔보이의 xDS API는 궁극적 일관성(eventual consistency)을 전제로 구축됐으며 궁극적으로는 올바른 구성으로 수렴한다는 것이다. 예를 들어 엔보이가 트래픽을 클러스터 foo로 라우팅하는 새 루트가 RDS로 업데이트됐는데, 이 클러스터 foo를 포함한 CDS 업데이트는 아직 수행되지 않았을 수 있다. 이 경우 CDS가 업데이트될 때까지 라우팅 오류가 발생할 수 있다. 이런 순서에 따른 경쟁 상태(race condition)를 해결하기 위해 도입한 것이 ADS이다. 이스티오는 프록시 설정 변경을 위해 ADS를 구현한다.

예를 들어 엔보이 프록시의 리스너를 동적으로 찾으려면 다음과 같은 설정을 사용할 수 있다.

```bash
dynamic_resources:
  lds_config: # Configuration for listeners (LDS) 리스너용 설정
    api_config_source:
      api_type: GRPC
      grpc_services:
        - envoy_grpc: # Go to this cluster for the listener API. 이 클러스터로 이동해 리스너 API를 확인
            cluster_name: xds_cluster

clusters: 
- name: xds_cluster # gRPC cluster that implements LDS. LDS를 구현하는 gRPC 클러스터
  connect_timeout: 0.25s
  type: STATIC
  lb_policy: ROUND_ROBIN
  http2_protocol_options: {}
  hosts: [{ socket_address: {
    address: 127.0.0.3, port_value: 5678 }}]
```

이 설정을 사용하면 설정 파일에 각 리스너를 명시적으로 설정하지 않아도 되며, 엔보이에게 LDS API를 사용해 런타임에 올바른 리스너 설정값을 찾으라고 지시한다. 그렇지만 클러스터 하나는 명시적으로 설정하고 있는데, LDS API가 위치한 클러스터이다. (이 예제에서는 `xds_cluster`로 명명했다)

좀 더 구체적인 예를 들면, 이스티오는 서비스 프록시용으로 다음과 같이 부트스트랩 설정을 사용한다.

```bash
bootstrap:
  dynamicResources:
    ldsConfig:
      ads: {} # ADS for listeners 리스너용 ADS
    cdsConfig:
      ads: {} # ADS for clusters 클러스터용 ADS
    adsConfig:
      apiType: GRPC
      grpcServices:
      - envoyGrpc:
          clusterName: xds-grpc # Uses a cluster named xds-grpc 라는 클러스터를 사용
      refreshDelay: 1.000s

  staticResources:
    clusters:
    - name: xds-grpc # Defines the xds-grpc cluster 라는 클러스터를 정의
      type: STRICT_DNS
      connectTimeout: 10.000s
      hosts:
      - socketAddress:
          address: istio-pilot.istio-system
          portValue: 15010
      circuitBreakers: # Reliability and circuit-breaking settings 신뢰성 및 서킷 브레이커 설정
        thresholds:
        - maxConnections: 100000
          maxPendingRequests: 100000
          maxRequests: 100000
        - priority: HIGH
          maxConnections: 100000
          maxPendingRequests: 100000
          maxRequests: 100000
      http2ProtocolOptions: {}
```

간단한 정적 엔보이 설정 파일을 수정해서 엔보이가 작동하는 모습을 살펴보겠다.

## Envoy in action

엔보이는 C++로 작성돼 플랫폼에 맞게 컴파일된다. 엔보이를 시작하기 가장 좋은 방법은 도커를 사용해 컨테이너를 실행하는 것이다.

도커 이미지를 가져온다. (`citizenstig/httpbin`은 arm CPU 미지원 - [Link](https://hub.docker.com/r/citizenstig/httpbin/tags))

```bash
# 도커 이미지 가져오기
docker pull envoyproxy/envoy:v1.19.0
docker pull curlimages/curl
docker pull mccutchen/go-httpbin

# 확인
docker images
```

간단한 httpbin 서비스를 만들어보겠다. 기본적으로 httpbin은 호출하는 엔드포인트에 따라 호출할 때 사용한 헤더를 반환하거나, HTTP 요청을 지연시키거나, 오류를 발생시키는 등의 서비스를 제공한다. httpbin 서비스를 시작한 다음 엔보이를 시작하고 모든 트래픽이 httpbin 서비스로 가도록 프록시를 설정한다. 그러고 나서 클라이언트 앱을 시작해 프록시를 호출한다.

httpbin 서비스를 실행한다.

```bash
# mccutchen/go-httpbin 는 기본 8080 포트여서, 책 실습에 맞게 8000으로 변경
docker run -d -e PORT=8000 --name httpbin mccutchen/go-httpbin 
docker ps

# curl 컨테이너로 httpbin 호출 확인
docker run -it --rm --link httpbin curlimages/curl curl -X GET http://httpbin:8000/headers
{
  "headers": {
    "Accept": [
      "*/*"
    ],
    "Host": [
      "localhost:8000"
    ],
    "User-Agent": [
      "curl/8.7.1"
    ]
  }
}
```

`/headers` 엔드포인트를 호출하는데 사용한 헤더가 함께 반환된다.

이제 엔보이 프록시를 실행하고 `--help`를 전달해 플래그와 명령줄 파라미터 중 일부를 살펴보겠다.

```bash
docker run -it --rm envoyproxy/envoy:v1.19.0 envoy --help
...
   --service-zone <string> # 프록시를 배포할 가용 영역을 지정
     Zone name

   --service-node <string> # 프록시에 고유한 이름 부여
     Node name
     
...
   -c <string>,  --config-path <string> # 설정 파일을 전달
     Path to configuration file
```

유효한 설정 파일을 전달하지 않으면 엔보이는 다음과 같이 종료된다.

```bash
docker run -it --rm envoyproxy/envoy:v1.19.0 envoy
[2021-11-21 21:28:37.347][1][info][main]
➥[source/server/server.cc:855] exiting
At least one of --config-path or --config-yaml or
➥Options::configProto() should be non-empty
```

이를 수정하고 앞서 봤던 예제 설정 파일을 전달해보겠다.

```bash
admin:
  address:
    socket_address: { address: 0.0.0.0, port_value: 15000 }

static_resources:
  listeners:
  - name: httpbin-demo
    address:
      socket_address: { address: 0.0.0.0, port_value: 15001 }
    filter_chains:
    - filters:
      - name:  envoy.filters.network.http_connection_manager
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          stat_prefix: ingress_http
          http_filters:
          - name: envoy.filters.http.router
          route_config:
            name: httpbin_local_route
            virtual_hosts:
            - name: httpbin_local_service
              domains: ["*"]
              routes:
              - match: { prefix: "/" }
                route:
                  auto_host_rewrite: true
                  cluster: httpbin_service
  clusters:
    - name: httpbin_service
      connect_timeout: 5s
      type: LOGICAL_DNS
      dns_lookup_family: V4_ONLY
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: httpbin
        endpoints:
        - lb_endpoints:
          - endpoint:
              address:
                socket_address:
                  address: httpbin
                  port_value: 8000
```

기본적으로 15001 포트에 단일 리스너를 노출하고 모든 트래픽을 httpbin 클러스터로 라우팅한다.

엔보이를 시작한다.

```bash
cat ch3/simple.yaml

# 터미널1
docker run --name proxy --link httpbin envoyproxy/envoy:v1.19.0 --config-yaml "$(cat ch3/simple.yaml)"

# 터미널2
docker logs proxy
[2025-04-12 08:25:15.455][1][info][config] [source/server/listener_manager_impl.cc:834] all dependencies initialized. starting workers
[2025-04-12 08:25:15.456][1][info][main] [source/server/server.cc:804] starting main dispatch loop
```

프록시가 성공적으로 시작해 15001 포트를 리스닝하고 있다.

curl로 프록시를 호출한다.

```bash
# 터미널2
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/headers
{
  "headers": {
    "Accept": [
      "*/*"
    ],
    "Host": [
      "httpbin"
    ],
    "User-Agent": [
      "curl/8.13.0"
    ],
    "X-Envoy-Expected-Rq-Timeout-Ms": [
      "15000" # 15000ms = 15초
    ],
    "X-Forwarded-Proto": [
      "http"
    ],
    "X-Request-Id": [
      "8d08bd8e-7899-42e1-bf74-7a3381a2494a"
    ]
  }
}
```

프록시를 호출했는데도 트래픽이 httpbin 서비스로 정확하게 전송됐다. 또 다음과 같은 새로운 헤더도 추가됐다.

- **X-Envoy-Expected-Rq-Timeout-Ms**
- **X-Request-Id**

엔보이는 새 `X-Request-Id`를 만들었는데, 이는 클러스터 내 다양한 요청 사이의 관계를 파악하고 요청을 처리하기 위해 여러 서비스를 거치는 동안(즉, 여러 홉)을 추적하는 데 활용할 수 있다. 두 번째 헤더인 `X-Envoy-Expected-Rq-Timeout-Ms`는 업스트림 서비스에 대한 힌트로, 요청이 15,000ms 후에 타임아웃될 것으로 기대한다는 의미이다. 업스트림 시스템과 그 요청이 거치는 모든 홉은 이 힌트를 사용해 데드라인을 구현할 수 있다. 데드라인이 넘으면 처리를 중단하게 해 타임아웃된 후 묶여 있던 리소스가 풀려난다.

다음 실습을 위해 Envoy를 종료한다. **`docker rm -f proxy`**

이제 이 구성을 살짝 변경해 예상 요청 타임아웃을 1초로 설정해보겠다. 설정 파일에 라우팅 규칙을 업데이트한다.

```bash
              - match: { prefix: "/" }
                route:
                  auto_host_rewrite: true
                  cluster: httpbin_service
                  timeout: 1s
```

실행한다.

```bash
cat ch3/simple_change_timeout.yaml
docker run --name proxy --link httpbin envoyproxy/envoy:v1.19.0 --config-yaml "$(cat ch3/simple_change_timeout.yaml)"
docker ps

# 타임아웃 설정 변경 확인
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/headers
{
  "headers": {
    "Accept": [
      "*/*"
    ],
    "Host": [
      "httpbin"
    ],
    "User-Agent": [
      "curl/8.13.0"
    ],
    "X-Envoy-Expected-Rq-Timeout-Ms": [
      "1000" # 1000ms = 1초
    ],
    "X-Forwarded-Proto": [
      "http"
    ],
    "X-Request-Id": [
      "dbff822d-17df-4d8c-bd4d-9c9d6f890cff"
    ]
  }
}

# 추가 테스트 : Envoy Admin API(TCP 15000) 를 통해 delay 설정
docker run -it --rm --link proxy curlimages/curl curl -X POST http://proxy:15000/logging
docker run -it --rm --link proxy curlimages/curl curl -X POST http://proxy:15000/logging?http=debug

docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/delay/0.5
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/delay/1
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/delay/2
upstream request timeout
```

### Admin API

엔보이의 Admin API를 사용하면 프록시 동작에 대한 통찰력을 향상시킬 수 있고, 메트릭과 설정에 접근할 수 있다.

```bash
docker run --name proxy --link httpbin envoyproxy/envoy:v1.19.0 --config-yaml "$(cat ch3/simple_change_timeout.yaml)"

# admin API로 Envoy stat 확인 : 응답은 리스너, 클러스터, 서버에 대한 통계 및 메트릭
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/stats

# retry 통계만 확인
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/stats | grep retry
cluster.httpbin_service.circuit_breakers.default.rq_retry_open: 0
cluster.httpbin_service.circuit_breakers.high.rq_retry_open: 0
cluster.httpbin_service.retry_or_shadow_abandoned: 0
cluster.httpbin_service.upstream_rq_retry: 0
cluster.httpbin_service.upstream_rq_retry_backoff_exponential: 0
cluster.httpbin_service.upstream_rq_retry_backoff_ratelimited: 0
cluster.httpbin_service.upstream_rq_retry_limit_exceeded: 0
cluster.httpbin_service.upstream_rq_retry_overflow: 0
cluster.httpbin_service.upstream_rq_retry_success: 0
...

# 다른 엔드포인트 일부 목록들도 확인
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/certs        # 머신상의 인증서
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/clusters     # 엔보이에 설정한 클러스터
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/config_dump  # 엔보이 설정 덤프
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/listeners    # 엔보이에 설정한 리스너
docker run -it --rm --link proxy curlimages/curl curl -X POST http://proxy:15000/logging                 # 로깅 설정 확인 가능
docker run -it --rm --link proxy curlimages/curl curl -X POST http://proxy:15000/logging?http=debug     # 로깅 설정 편집 가능
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/stats                   # 엔보이 통계
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/stats/prometheus        # 엔보이 통계(프로메테우스 레코드 형식)
```

### 요청 재시도

httpbin 요청을 일부러 실패시켜 엔보이가 어떻게 요청을 자동으로 재시도하는지 살펴보겠다. 먼저 `retry_policy`를 사용하도록 설정 파일을 업데이트한다.

```bash
              - match: { prefix: "/" }
                route:
                  auto_host_rewrite: true
                  cluster: httpbin_service
                  retry_policy:
                      retry_on: 5xx  # 5xx 일때 재시도
                      num_retries: 3 # 재시도 횟수
```

```bash
docker rm -f proxy

cat ch3/simple_retry.yaml
docker run -p 15000:15000 --name proxy --link httpbin envoyproxy/envoy:v1.19.0 --config-yaml "$(cat ch3/simple_retry.yaml)"
docker run -it --rm --link proxy curlimages/curl curl -X POST http://proxy:15000/logging?http=debug

# /stats/500 경로로 프록시를 호출 : 이 경로로 httphbin 호출하면 오류가 발생
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15001/status/500

# 호출이 끝났는데 아무런 응답도 보이지 않는다. 엔보이 Admin API에 확인
docker run -it --rm --link proxy curlimages/curl curl -X GET http://proxy:15000/stats | grep retry
...
cluster.httpbin_service.retry.upstream_rq_500: 3
cluster.httpbin_service.retry.upstream_rq_5xx: 3
cluster.httpbin_service.retry.upstream_rq_completed: 3
cluster.httpbin_service.retry_or_shadow_abandoned: 0
cluster.httpbin_service.upstream_rq_retry: 3
...
```

엔보이는 업스트림 클러스터 httpbin 호출할 때 HTTP 500 응답을 받았다. 엔보이는 요청을 재시도했으며, 이는 통계값에 `cluster.httpbin_service.upstream_rq_retry: 3`으로 표시돼 있다.

애플리케이션 네트워킹에 자동으로 신뢰성을 부여하는 엔보이의 기본 기능을 시연했다. 이 기능들을 추론하고 시연하는 데 정적 설정 파일을 사용했지만, 앞 절에서 봤듯이 이스티오는 동적 설정 기능을 사용한다. 이를 통해 이스티오는 각각의 설정을 복잡할 수 있는 대규모 엔보이 프록시 집합을 관리할 수 있다.

다음 실습을 위해 Envoy를 종료한다. **`docker rm -f proxy && docker rm -f httpbin`**

## How Envoy fits with Istio

엔보이는 이스티오의 기능 대부분에서 핵심 역할을 맡는다. 엔보이는 프록시로서 서비스 메시에 매우 적합하다. 하지만 엔보이를 최대한 활용하려면 보조 인프라나 구성 요소가 필요하다. 이스티오가 제공하는 사용자 설정, 보안 정책, 런타임 설정을 지원하는 구성 요소들이 컨트롤 플레인을 형성한다.

엔보이의 기능 덕분에 정적 설정 파일이나 런타임에 리스너, 엔드포인트, 클러스터를 찾기 위한 xDS 디스커버리 서비스를 사용해 서비스 프록시를 설정할 수 있다는 사실을 확인했다. 이스티오는 istiod 컨트롤 플레인 구성 요소에서 이 xDS API들을 구현한다. istiod는 쿠버네티스 API를 사용해 VirtualService 등의 이스티오 설정을 읽은 다음 서비스 프록시를 동적으로 설정한다.

관련 예로는 엔드포인트를 검색하기 위해 일종의 서비스 저장소에 의존하는 엔보이의 서비스 디스커버리가 있다. istiod는 이 API를 구현하기도 하지만 엔보이에게 서비스 저장소의 구현을 추상화하기도 한다. 이스티오를 쿠버네티스에 배포하면 서비스 디스커버리에 쿠버네티스의 서비스 저장소를 사용한다. 이런 구현 세부 사항은 엔보이 프록시에게 완벽히 감춰진다.

또 다른 예시로, 엔보이는 많은 메트릭과 텔레메트리를 내보낼 수 있다. 이 텔레메트리는 어딘가로 이동해야 하며, 엔보이는 이를 보내도록 설정돼야 한다. 이스티오는 프로메테우스 같은 시계열 시스템과 통합하도록 데이터 플레인을 설정한다. 엔보이가 어떻게 분산 트레이싱 스팬을 오픈트레이싱 엔진에 보낼 수 있는지, 이스티오가 어떻게 스팬을 그 위치로 보낼 수 있는지도 확인했다. 예를 들어 이스티오는 예거 트레이싱 엔진과 통합할 수 있으며, 집킨도 사용할 수 있다.

마지막으로 엔보이는 메시 내의 서비스로 향하는 TLS 트래픽을 종료하고 시작할 수 있다. 그렇게 하려면 인증서를 생성, 서명, 로테이션하는 보조 인프라가 필요하다. 이스티오는 이를 istiod 구성 요소를 통해 제공한다.

이스티오의 구성 요소와 엔보이 프록시는 강력한 서비스 메시를 구현하는 데 함께 기여한다. 이제부터 엔보이를 이스티오 프록시라 부르며, 그 기능들을 이스티오의 API를 통해 살펴볼 것이다. 그렇지만 실제로는 많은 것이 엔보이가 제공하고 구현하는 것임을 이해해야 한다.

## Summary

- Envoy는 애플리케이션이 애플리케이션 수준의 동작에 사용할 수 있는 프록시이다.
- Envoy는 이스티오의 데이터 플레인이다.
- Envoy는 클라우드 신뢰성 문제(네트워크 장애, 토폴로지 변경, 탄력성)를 일관되고 정확하게 해결하는 데 도움을 준다.
- Envoy는 런타임 제어를 위해 동적 API를 사용한다(Istio는 이를 사용한다).
- Envoy는 애플리케이션 사용 및 프록시 내부에 대한 강력한 지표와 정보를 많이 노출한다.

## 참고

- Envoy documentation and comparison: http://bit.ly/2U2g7zb
- Turbine Labs' switch from Nginx to Envoy: http://bit.ly/2nn4tPr
- Cindy Sridharan's initial take on Envoy: http://bit.ly/2OqbMkR
- Why Ambassador chose Envoy over HAProxy and Nginx: http://bit.ly/2OVbsvz
- xDS internals blog: https://www.anyflow.net/sw-engineer/istio-internals-by-xds
- alice_k106 EnvoyCon 자료: https://blog.naver.com/alice_k106/222000680202
- Envoy xDS protocol: https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol#aggregated-discovery-service
