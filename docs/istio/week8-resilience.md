---
tags:
  - Istio
  - Resilience
---

# Istio - Resilience

> Istio의 Circuit Breaker, Retry, Timeout 등 탄력성 패턴 구현 방법을 정리한다.

Istio의 `DestinationRule`은 특정 서비스로 향하는 트래픽의 로드 밸런싱·커넥션 풀·이상값 감지·가중 분포 등을 설정해 복원력 패턴을 적용하는 리소스이다. 애플리케이션 코드를 수정하지 않고 네트워크 수준에서 타임아웃·재시도·서킷 브레이킹을 구성할 수 있다.

---

## 1. 들어가며

마이크로서비스 아키텍처에서 **복원력(resilience)** 은 장애 시에도 시스템이 중단 없이 작동하도록 보장하는 핵심 요구사항이다.  
Istio를 사용하면 애플리케이션 코드를 건드리지 않고, 트래픽 수준에서 **타임아웃·재시도·서킷 브레이킹·로드 밸런싱**을 구성해 장애를 흡수할 수 있다.

이 문서에서는 Istio in Action 6장의 주요 개념과 실습 예제를 바탕으로, 복원력 패턴을 Istio 설정으로 어떻게 구현하는지 단계별로 살펴봅니다.

## 2. 서비스 메시 기반 복원력

Istio의 데이터 플레인(sidecar) 프록시는 Envoy를 기반으로 하며, 애플리케이션과 동일한 네트워크 경로에서 모든 요청을 제어한다.  
이 구조를 통해 각 인스턴스 옆에서 타임아웃·재시도·로드 밸런싱 로직을 **투명하게** 삽입할 수 있다.

기존에는 애플리케이션 라이브러리(Finagle, Hystrix 등)를 사용해 언어별로 복원력 코드를 작성해야 했지만, Istio는 설정만으로 **언어·프레임워크 무관**하게 일관된 동작을 제공한다.

## 3. 클라이언트 측 로드 밸런싱
![](https://velog.velcdn.com/images/juwon8891/post/c9e4c6b0-95a6-42a0-a65e-f5aa33ed84b7/image.png)
![](https://velog.velcdn.com/images/juwon8891/post/c14283d8-bf9a-4ea1-8c0c-3ad84c5727c8/image.png)

### 3.1 DestinationRule 설정

클라이언트 측 로드 밸런싱을 구현하려면 `DestinationRule`의 `trafficPolicy.loadBalancer.simple` 필드를 사용한다:
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: backend-dr
spec:
  host: simple-backend.example.svc.cluster.local
  trafficPolicy:
    loadBalancer:
      simple: LEAST_CONN   # ROUND_ROBIN, RANDOM, LEAST_CONN
```
- **ROUND_ROBIN**: 순차 분산 (기본)
- **RANDOM**: 무작위 분산
- **LEAST_CONN**: 활성 요청이 가장 적은 엔드포인트 우선

```yaml

```
LB 알고리즘에 따른 응답 시간 측정
![](https://velog.velcdn.com/images/juwon8891/post/31812ba0-45f8-4d82-80ab-710f63e23eb0/image.png)

Fortio는 Istio에서 만든 응답 테스트 도구이다.

라운드 로빈·랜덤 밸런싱 전략의 경우 75분위수에서 응답이 1초 이상 걸리지만, LEAST_CONN 방식에서는 200ms로 더 빠른 결과를 확인할 수 있다.

![](https://velog.velcdn.com/images/juwon8891/post/4c189bf2-82f3-469e-a827-28d883bde081/image.png)

정리
-  빠른 장애 감지와 우회
클라이언트가 직접 서버의 상태를 감지하기 때문에, 서버 인스턴스에 장애가 발생했을 때 중앙 시스템을 거치지 않고 즉시 문제를 감지하고 다른 정상 인스턴스로 요청을 우회할 수 있다. 이를 통해 서비스 장애 시간을 최소화할 수 있다.

- 부하 분산 및 확장성 향상
클라이언트 사이드 로드밸런싱은 모든 요청을 중앙 로드밸런서에 몰아주지 않고, 각 클라이언트가 자체적으로 부하를 분산한다. 이 방식은 네트워크 병목을 줄이고, 시스템이 커져도 안정적으로 확장할 수 있는 구조를 제공한다.

- 세밀한 트래픽 제어
DestinationRule을 이용하면 재시도(Timeout & Retry), 회로 차단(Circuit Breaker), 연결 풀(Connection Pool) 설정 등 다양한 세부 정책을 적용할 수 있다. 이를 통해 트래픽 처리 방식을 세밀하게 제어하여, 더욱 안정적이고 효율적인 서비스 운영이 가능한다.

- 버전별 트래픽 분배 지원
DestinationRule은 VirtualService와 함께 사용하여, **v1 버전에 80%, v2 버전에 20%**와 같이 버전별로 트래픽을 나누는 것도 가능한다. 이를 통해 점진적인 배포(캔리 릴리즈)나 A/B 테스트 같은 운영 전략을 쉽게 구현할 수 있다.

### 3.2 지역 인식 및 가중 분포

- `spec.trafficPolicy.localityLbSetting`으로 **리전·영역별** 우선순위나 가중치를 지정 가능
- 기본적으로 같은 영역(locality) 내 인스턴스를 선호
- `distribute`를 통해 예: 70% 로컬, 30% 이종 영역 분산

## 4. 타임아웃과 재시도

### 4.1 VirtualService로 타임아웃

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: backend-vs
spec:
  hosts:
  - simple-backend
  http:
  - route:
    - destination:
        host: simple-backend
    timeout: 0.5s
```
- 요청이 0.5초를 넘어서면 자동으로 실패 처리
![](https://velog.velcdn.com/images/juwon8891/post/8a7719d0-7ab1-411a-935e-822fe1cf6e9a/image.png)

500 응답이 간헐적으로 발생함을 확인할 수 있다.

### 4.2 재시도 정책

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: simple-backend-vs
spec:
  hosts:
  - simple-backend
  http:
  - route:
    - destination:
        host: simple-backend
    retries:
      attempts: 2 # 최대 재시도 횟수
      retryOn: gateway-error,connect-failure,retriable-4xx # 다시 시도해야 할 오류
      perTryTimeout: 300ms # 타임 아웃
      retryRemoteLocalities: true # 재시도 시 다른 지역의 엔드포인트에 시도할지 여부
```
- 기본 재시도는 2회이며 HTTP 503 등 특정 오류에만 동작
- `retryOn: 5xx`로 모든 서버 오류에 재시도 가능
- `retryRemoteLocalities: true` 로 타 지역 엔드포인트까지 재시도 확장

![](https://velog.velcdn.com/images/juwon8891/post/52fbf5b4-c8d8-43ba-84af-087a312db2b9/image.png)
모두 성공했음을 확인할 수 있다.

### 4.3 고급 EnvoyFilter

`EnvoyFilter`를 통해 기본값에 없는 **백오프 간격**이나 **추가 상태 코드**(예: 408) 재시도를 직접 설정할 수 있다.

## 5. 서킷 브레이킹

### 5.1 커넥션 풀 제어

`DestinationRule`의 `connectionPool` 설정으로 동시 커넥션·요청 개수를 제한해, 과부하 시 **빠르게 실패(fail-fast)** 하도록 한다:
```yaml
trafficPolicy:
  connectionPool:
    http:
      http1MaxPendingRequests: 1
      maxRequestsPerConnection: 1
    tcp:
      maxConnections: 100
```
- 제한 초과 시 Envoy가 503(UO) 상태를 반환

### 5.2 이상값 감지 (Outlier Detection)

```yaml
trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 1 # 잘못된 요청이 하나만 발생해도 이상값 감지가 발동. 기본값 5
      interval: 5s # 이스티오 서비스 프록시가 체크하는 주기. 기본값 10초. Time interval between ejection sweep analysis
      baseEjectionTime: 5s # 서비스 엔드포인트에서 제거된다면, 제거 시간은 n(해당 엔드포인트가 쫓겨난 횟수) * baseEjectionTime. 해당 시간이 지나면 로드 밸런싱 풀에 다시 추가됨. 기본값 30초. 
      maxEjectionPercent: 100 # 로드 밸런싱 풀에서 제거 가능한 호스트 개수(%). 모든 호스트가 오동작하면 어떤 요청도 통과 못함(회로가 열린 것과 같다). 기본값 10%
```
- 연속 오류 감지 시 해당 호스트를 풀에서 잠시 제외
- `maxEjectionPercent`로 제거 비율 제어
- 장애 복구 후 자동 복귀

## 6. 요약

| 리소스 | 역할 |
|--------|------|
| **DestinationRule** | 로드 밸런싱, 커넥션 풀, 이상값 감지, 지역 분포 설정 |
| **VirtualService** | 타임아웃·재시도 정책 |
| **EnvoyFilter** | Istio API에 없는 고급 Envoy 설정 |

코드 변경 없이 네트워크 수준에서 **투명하게 복원력 기능**을 활성화할 수 있다.

Istio를 통해 애플리케이션 복원력을 구축하면, 예기치 않은 장애와 급격한 토폴로지 변화에도 **안정적인 서비스 운영**이 가능해집니다.
