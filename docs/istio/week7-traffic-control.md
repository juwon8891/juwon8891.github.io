---
tags:
  - Istio
  - Traffic Management
---

# Istio 트래픽 제어 - VirtualService, ServiceEntry, Sidecar, Mesh

> VirtualService, DestinationRule, ServiceEntry를 활용한 Istio 트래픽 제어 방법을 정리한다.

이 글에서는 Istio를 활용해 마이크로서비스 간 및 클러스터 외부로 나가는 트래픽을 섬세하게 제어하는 핵심 리소스 네 가지를 살펴봅니다. 실제 운영 환경에서 카나리, 다크 런치, 보안 화이트리스트 등 다양한 패턴을 구현할 수 있도록 각 객체의 역할과 설정 예시를 정리했다.

---

## 1. VirtualService: L7 계층 트래픽 라우팅

### 한 줄 요약
`VirtualService`는 HTTP 요청을 호스트·경로·헤더 단위로 분기해 지정한 서비스 버전(subset)으로 보냅니다.

### 상세 설명
Istio의 **VirtualService**는 애플리케이션 계층(L7)에서 “이 요청을 어디로 보낼지” 결정할 수 있게 해준다. 주요 필드는 아래와 같다:

- `hosts`: 라우팅 대상 호스트 목록
- `gateways`: 요청을 수신할 Ingress/Egress Gateway 또는 내부 메시 게이트웨이(`mesh`)
- `http`: match/route 규칙을 순차 적용
  - **match**: `prefix`, `headers`, `method` 등으로 필터링
  - **route**: destination(host, subset, port) + optional weight

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: catalog
  namespace: istioinaction
spec:
  hosts:
    - catalog.istioinaction.io      # 외부 도메인
  gateways:
    - catalog-gateway               # Edge Ingress
  http:
    # 1) cohort 헤더에 따라 v2로 분기 (다크 런치)
    - match:
        - headers:
            x-istio-cohort:
              exact: "internal"
      route:
        - destination:
            host: catalog
            subset: version-v2
    # 2) 나머지 트래픽은 v1로
    - route:
        - destination:
            host: catalog
            subset: version-v1
```

이 설정을 적용하면, `x-istio-cohort: internal` 헤더가 있는 요청만 신버전(v2)으로 보내고 나머지는 기존(v1)에 머무르게 할 수 있다.

---

## 2. ServiceEntry: 메시 외부 서비스 등록

### 한 줄 요약
`ServiceEntry`는 Istio 내부 서비스 레지스트리에 클러스터 외부 호스트를 등록해 Egress 트래픽을 허용한다.

### 상세 설명
기본적으로 Istio는 쿠버네티스 클러스터 내부의 `Service`만 인식한다. 외부 API나 DB에 접근하려면, **ServiceEntry**를 통해 외부 호스트 정보를 메시 카탈로그에 삽입해야 한다.

- `hosts`: 호출할 외부 도메인
- `ports`: 프로토콜·포트 정의(예: HTTP/80)
- `resolution`: DNS 또는 STATIC
- `location`: `MESH_EXTERNAL`

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: ServiceEntry
metadata:
  name: external-forum
  namespace: istioinaction
spec:
  hosts:
    - jsonplaceholder.typicode.com   # 무료 테스트 API
  ports:
    - number: 80
      name: http
      protocol: HTTP
  resolution: DNS
  location: MESH_EXTERNAL
```

위 리소스를 배포하면, `webapp` 같은 내부 서비스에서 `jsonplaceholder.typicode.com`으로 나가는 호출이 정상 처리되고, Istio가 트래픽을 관찰·제어 가능한 지점을 확보한다.

---

## 3. Sidecar: 사이드카 Envoy 범위 제어

### 한 줄 요약
`Sidecar` 리소드는 특정 워크로드 레이블에 적용할 인그레스/이그레스 리스너와 서비스 디스커버리 범위를 제한한다.

### 상세 설명
서비스 메시 전체나 네임스페이스 단위가 아닌, **앱(레이블)** 단위로 사이드카 동작 범위를 좁힐 때 `Sidecar`를 사용한다.

- `workloadSelector`: 레이블로 대상 파드 선택
- `ingress`/`egress`: Envoy가 노출할 포트·호스트 범위
- 서비스 디스커버리 스코프 제한

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: Sidecar
metadata:
  name: catalog-sidecar
  namespace: istioinaction
spec:
  workloadSelector:
    labels:
      app: catalog
  ingress:
    - port:
        number: 8080
        protocol: HTTP
      defaultEndpoint: 127.0.0.1:3000
  egress:
    - hosts:
        - "istio-system/*"            # control plane
        - "istioinaction/*"          # 같은 네임스페이스 서비스
```

이렇게 적용하면, catalog 사이드카는 명시된 리소스 외에는 접근하거나 노출하지 않다.

---

## 4. Gateways.Mesh: 메시 내부 라우팅 적용

### 한 줄 요약
VirtualService에 `gateways: ["mesh"]`를 지정하면, Ingress/Egress가 아닌 **사이드카 간** 내부 트래픽에도 라우팅 규칙이 적용된다.

### 상세 설명
기본 Gateway 리소스와 달리 `mesh` 게이트웨이는 메시 내부 트래픽에만 규칙을 배포한다. 예를 들어, `webapp → catalog` 호출을 사이드카 단계에서 조건 분기하고 싶을 때 유용한다.

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: catalog-mesh
  namespace: istioinaction
spec:
  hosts:
    - catalog                     # 클러스터IP 호스트
  gateways:
    - mesh                        # 내부 전용
  http:
    - match:
        - headers:
            x-istio-cohort:
              exact: internal
      route:
        - destination:
            host: catalog
            subset: version-v2
    - route:
        - destination:
            host: catalog
            subset: version-v1
```

이제 외부 게이트웨이를 거치지 않고도 서비스 간 L7 라우팅이 가능한다.

---

## 맺음말

1. **VirtualService**: 세밀한 L7 라우팅 (경로·헤더·가중치) 구현
2. **ServiceEntry**: 외부 API·서비스를 메시 레지스트리에 등록
3. **Sidecar**: 워크로드별 사이드카 인그레스/이그레스·디스커버리 범위 제한
4. **Gateways.Mesh**: 메시 내부 호출에도 VirtualService 규칙 적용

이 네 가지를 통해 카나리, 다크 런치, 트래픽 미러링, Egress 화이트리스트 같은 고급 트래픽 관리 패턴을 안정적으로 구현할 수 있다.
