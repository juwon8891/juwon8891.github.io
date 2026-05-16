---
tags:
  - Envoy
---

# Envoy Quick Start 실습 가이드

> Docker 환경에서 Envoy를 실행하고 커스텀 설정을 적용하는 Quick Start 실습 과정을 정리한다.

Envoy는 HTTP/1.1, HTTP/2, gRPC 등 다양한 L7 프로토콜을 처리하는 고성능 오픈소스 프록시이다. Lyft에서 개발되어 CNCF에 기여되었으며, 서비스 메시, API 게이트웨이, 인그레스 컨트롤러 등 다양한 사용 사례에 활용된다. 이번 포스트에서는 공식 [Quick Start 튜토리얼](https://www.envoyproxy.io/docs/envoy/latest/start/quick-start/)을 따라 Docker 환경에서 Envoy를 빠르게 실행하고, 구성 파일 구조를 분석하며, 커스텀 설정을 적용해 보는 과정을 단계별로 실습한다.

---


## 1. Envoy 개요 및 핵심 개념

### Envoy란?
- **L7 프록시**: HTTP/1.1, HTTP/2, gRPC 트래픽을 처리
- **Sidecar 패턴**: Kubernetes 등 플랫폼에서 각 서비스 옆에 사이드카로 배포
- **Control Plane**: xDS API를 통해 동적 구성 관리 가능

### 주요 구성 요소

| 구성 요소 | 설명 |
|-----------|------|
| **Listener** | 네트워크 연결 수신 엔드포인트 |
| **Filter Chain** | 수신된 트래픽에 적용할 필터 집합(HTTP 커넥션 매니저 등) |
| **Cluster** | 백엔드 서비스 그룹, 로드 밸런싱 대상 |
| **Endpoint** | 클러스터 내 실제 인스턴스 주소 |
| **Admin Interface** | `/stats`, `/config_dump` 등 런타임 정보 조회 |

---

## 2. 사전 준비

### 필수 조건

- **Docker 20.x+** 설치 및 실행 중
- **터미널**(Linux/macOS) 또는 **PowerShell**(Windows) 환경
- **포트 10000, 9901** 사용 가능 여부 확인

### 설치 확인

```bash
# Docker 설치 확인
$ docker --version
# curl 설치 확인 (관리 API 호출용)
$ curl --version || echo "curl 설치 필요"
```

---

## 3. 버전 확인 및 데모 실행

### 3.1 Envoy 버전 확인

로컬 바이너리가 있는 경우:
```bash
$ envoy --version
```
Docker 이미지 사용할 경우:
```bash
$ docker run --rm \
    envoyproxy/envoy:dev-7ec20a37f7778f802fd13c88b3721d6d1ae99d41 \
    --version
```
> 예상 출력:
> ```
> envoy  version:  dev 7ec20a37f7778f802fd13c88b3721d6d1ae99d41/1.18.3
> ```

### 3.2 데모 구성 실행

Envoy 공식 데모 설정(`envoy-demo.yaml`)을 사용해 컨테이너 실행:
```bash
$ docker run --rm -it \
    -p 9901:9901 \   # Admin API
    -p 10000:10000 \ # 트래픽 포트
    envoyproxy/envoy:dev-7ec20a37f7778f802fd13c88b3721d6d1ae99d41
```

- 실행 로그에서 `starting main dispatch loop` 확인
- `http://localhost:10000`에 요청 전송 시 자동으로 `www.envoyproxy.io` 프록시

```bash
$ curl http://localhost:10000
``` 
![](https://velog.velcdn.com/images/juwon8891/post/8e75da1f-2fbb-472e-b19a-1723e8b62d70/image.png)

---

## 4. 데모 구성 파일 심층 분석

컨테이너에 접속하여 설정 파일 확인:
```bash
$ docker run --rm -it envoyproxy/envoy:dev-... /bin/bash
$ cat /etc/envoy/envoy-demo.yaml
```

### 핵심 설정 발췌
```yaml
static_resources:
  listeners:
  - name: listener_0
    address: { socket_address: { address: 0.0.0.0, port_value: 10000 }}
    filter_chains:
    - filters:
      - name: envoy.filters.network.http_connection_manager
        typed_config:
          stat_prefix: ingress_http
          route_config:
            virtual_hosts:
            - name: local_service
              domains: ["*"]
              routes:
              - match: { prefix: "/" }
                route: { cluster: service_envoyproxy_io }

  clusters:
  - name: service_envoyproxy_io
    type: LOGICAL_DNS
    load_assignment:
      cluster_name: service_envoyproxy_io
      endpoints:
      - lb_endpoints:
        - endpoint:
            address: { socket_address: { address: www.envoyproxy.io, port_value: 443 }}
    transport_socket:
      name: envoy.transport_sockets.tls
```

- **Listener** (`0.0.0.0:10000`): 모든 도메인(`"*"`)의 `/` 경로를 `service_envoyproxy_io` 클러스터로 라우팅
- **Cluster**: DNS(`LOGICAL_DNS`) 기반으로 `www.envoyproxy.io:443` TLS 연결

> `stat_prefix`로 모니터링 지표 그룹을 구분할 수 있다.

---

## 5. 커스텀 설정 작성 및 실행

### 5.1 설정 파일 작성

로컬에 `envoy-custom.yaml` 생성 후, 다음 예시로 수정:
```yaml
static_resources:
  listeners:
  - name: custom_listener
    address: { socket_address: { address: 0.0.0.0, port_value: 10000 }}
    filter_chains:
    - filters:
      - name: envoy.filters.network.http_connection_manager
        typed_config:
          stat_prefix: custom_http
          route_config:
            virtual_hosts:
            - name: httpbin_service
              domains: ["*"]
              routes:
              - match: { prefix: "/" }
                route: { cluster: httpbin_cluster }
          http_filters:
            - name: envoy.filters.http.router

  clusters:
  - name: httpbin_cluster
    type: LOGICAL_DNS
    lb_policy: ROUND_ROBIN
    load_assignment:
      cluster_name: httpbin_cluster
      endpoints:
      - lb_endpoints:
        - endpoint:
            address: { socket_address: { address: httpbin.org, port_value: 80 }}
```

### 5.2 Envoy 실행

```bash
$ docker run --rm -it \
    -v $(pwd)/envoy-custom.yaml:/etc/envoy/envoy.yaml \
    -p 9901:9901 -p 10000:10000 \
    envoyproxy/envoy:dev-7ec20a37f7778f802fd13c88b3721d6d1ae99d41 \
    -c /etc/envoy/envoy.yaml
```

### 5.3 결과 확인 및 테스트

- `/get` 경로 테스트:
  ```bash
  $ curl http://localhost:10000/get
  ```
  HTTPBin의 JSON 응답 확인

- `/status/418`:
  ```bash
  $ curl -i http://localhost:10000/status/418
  ```
  418 I'm a teapot 응답 확인

---

## 6. 구성 검증 및 문제 해결

### 6.1 사전 검증

```bash
# 로컬 바이너리
$ envoy --mode validate -c envoy-custom.yaml

# Docker
$ docker run --rm \
    -v $(pwd)/envoy-custom.yaml:/etc/envoy/envoy.yaml \
    envoyproxy/envoy:dev-... \
    --mode validate -c /etc/envoy/envoy.yaml
```

성공 시 `OK` 출력, 오류 시 상세 메시지 확인

### 6.2 흔한 오류 케이스

- **포트 충돌**: 이미 사용 중인 포트를 바인딩하려 할 때
- **YAML 문법 오류**: 들여쓰기 또는 콜론 누락
- **타입 불일치**: `lb_policy` 등 설정값 오탈자

> `docker logs [컨테이너ID]` 또는 터미널 에러 메시지를 확인하십시오.

---

## 7. Admin API 활용하기

```bash
# 통계 정보 상위 20개
$ curl http://localhost:9901/stats | head -n 20

# 구성 덤프 전체
$ curl http://localhost:9901/config_dump
```

- `/listeners` : 리스너 상태
- `/clusters` : 클러스터 건강 상태
- `/server_info` : Envoy 버전, 빌드 정보

> Admin API는 기본적으로 인증 없이 접근 가능하므로 운영 환경에서는 접근 제어가 필요한다.

---

## 8. 동적 파일 기반 설정 (옵션)

xDS 없이 파일 기반으로 동적 리소스를 적용하려면:
```yaml
node: { id: dynamic-node, cluster: dynamic-cluster }
dynamic_resources:
  lds_config: { path: /etc/envoy/lds.yaml }
  cds_config: { path: /etc/envoy/cds.yaml }
```
컨테이너 내 `/etc/envoy/lds.yaml`, `/etc/envoy/cds.yaml` 파일을 변경하면 Envoy가 자동으로 재로드한다.

---


- Envoy 공식 문서: https://www.envoyproxy.io/docs/envoy/latest
- GitHub 예제: https://github.com/envoyproxy/envoy

---

