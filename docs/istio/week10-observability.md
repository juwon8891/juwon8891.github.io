---
tags:
  - Istio
  - Observability
---

# Istio의 관찰 가능성(Observability)

> Kiali, Jaeger, Prometheus를 활용한 Istio 서비스 메시의 관찰 가능성 확보 방법을 정리한다.

Istio 서비스 메시는 애플리케이션 코드를 변경하지 않고도 메트릭·로그·트레이스를 통한 강력한 관찰 가능성 기능을 제공한다. 메트릭 수집 기본 개념부터 Grafana, Jaeger, Kiali를 활용한 네트워크 동작 시각화까지 다룬다.

## 1. 관찰 가능성이란 무엇인가?

관찰 가능성(Observability)은 시스템의 **특성** 중 하나로, **외부 신호와 특성만 보고**도 시스템의 **내부 상태를 이해하고 추론**할 수 있는 수준을 나타냅니다. 이 개념은 루돌프 칼만(Rudolf E. Kalman)이 1960년 논문 '제어 시스템의 일반 이론에 관해(On the General Theory of Control Systems)'에서 처음 발표한 제어 이론을 기반으로 한다.

관찰 가능성은 런타임 동작을 변경할 수 있는 제어 기능을 시스템에 구현하는 데 중요한다. 이스티오는 트래픽 전환, 복원력, 정책 강제 등 제어를 구현하는 데 도움이 될 수 있지만, 어떤 제어를 언제 사용해야 할지 알기 위해서는 **시스템에서 어떤 일이 일어나고 있는지 이해**해야 한다.

### 1.1 관찰가능성 vs. 모니터링

**모니터링**은 **관찰 가능성의 부분집합**이다. 모니터링은 바람직하지 않다고 알려진 상태를 감시하고 경고하고자, 특히 **메트릭을 수집하고 집계**한다. 반면에 **관찰 가능성**은 시스템을 예측하기 매우 어려운 것으로 보기에 **일어날 수 있는 모든 고장을 사전에 알 수는 없다고 가정**한다.

관찰 가능성은 **휠씬 더 많은 데이터**, 전체 집합이 기하급수적으로 클 수 있는 사용자 ID, 요청 ID, 소스 IP 등 카디널리티가 높은 데이터까지도 **수집**하고, 도구를 사용해 데이터를 **빠르게 탐색하고 질문**한다.

### 1.2 Istio가 관찰 가능성을 돕는 방법

**이스티오**는 **관찰 가능한 시스템을 구축하는 데 도움을 줄 수 있는 독특한 위치**에 있다. 이스티오의 **데이터 플레인 프록시**(Envoy)가 **서비스 간 네트워크 요청 경로에 자리**하고 있기 때문이다.

이스티오는 Envoy 서비스 프록시를 통해 요청 처리와 서비스 상호작용에 관련된 **중요 메트릭을 포착**할 수 있다. 이를테면 초당 요청 수, 요청 처리에 걸리는 시간(백분위수로 구분), 실패한 요청 수 등이 있다. 또한 이스티오는 시스템에 **새 메트릭을 동적으로 추가**할 수 있다.

관찰 가능성은 다음 세 가지 핵심 요소로 구성된다:
- **메트릭(Metrics)**: 시스템의 상태와 성능을 수치로 표현
- **로그(Logs)**: 시스템 내에서 발생한 이벤트의 기록
- **트레이스(Traces)**: 요청이 시스템을 통과하는 경로 추적

Istio는 이러한 관찰 가능성 요소들을 서비스 메시 레벨에서 제공하여, 개발자가 애플리케이션 코드를 수정하지 않고도 이러한 정보를 수집할 수 있게 한다.

## 2. Istio의 메트릭 수집

### 2.1 데이터 플레인 메트릭

Istio의 데이터 플레인(Envoy 프록시)은 서비스 간 통신에 대한 다양한 메트릭을 자동으로 수집한다. 주요 메트릭은 다음과 같다:

- **istio_requests_total**: 요청이 들어올 때마다 증가하는 카운터
- **istio_request_duration_milliseconds**: 요청 처리 시간의 분포
- **istio_request_bytes**: 요청 바디 크기의 분포
- **istio_response_bytes**: 응답 바디 크기의 분포

이러한 메트릭은 각 프록시에서 자동으로 수집되며, 다음과 같은 디멘션(dimension)으로 구분된다:

- 소스/목적지 워크로드, 서비스, 네임스페이스
- 응답 코드
- 요청 프로토콜
- 보안 정책 등

Envoy 프록시는 기본 메트릭 외에도 더 많은 상세 메트릭을 제공할 수 있다. 이를 활성화하는 방법에는 여러 가지가 있지만, 워크로드 단위로 설정하는 방법이 가장 권장된다:

**방법 1 (메시 전체 설정)**: IstioOperator를 사용하여 메시 전체에 적용

**방법 2 (해당 워크로드 별 명세)**: 워크로드 단위로 설정(애노테이션으로 포함할 메트릭 지정) ← 권장 방법

```yaml
# cat ch7/webapp-deployment-stats-inclusion.yaml
...
  template:
    metadata:
      annotations:
        proxy.istio.io/config: |-
          proxyStatsMatcher:
            inclusionPrefixes:
            - "cluster.outbound|80||catalog.istioinaction"
      labels:
        app: webapp
```
![](https://velog.velcdn.com/images/juwon8891/post/bf305778-a56a-46ab-9604-5bc41992be8d/image.png)

이 방법은 특정 워크로드에만 선택적으로 메트릭을 활성화할 수 있어 메트릭 수집 시스템의 부하를 최소화할 수 있다.

### 2.2 컨트롤 플레인 메트릭

Istio의 컨트롤 플레인(istiod)도 다양한 메트릭을 제공한다:

- **pilot_proxy_convergence_time**: 설정 변경이 프록시에 적용되는 데 걸리는 시간
- **pilot_xds_pushes**: xDS API 업데이트 횟수
- **citadel_server_csr_count**: 인증서 서명 요청 수
- **pilot_services**: 컨트롤 플레인에 알려진 서비스 수

이러한 메트릭은 컨트롤 플레인의 성능과 상태를 모니터링하는 데 유용한다.

## 3. Prometheus를 사용한 메트릭 수집

Istio 메트릭을 효과적으로 활용하려면 이를 수집하고 저장할 시스템이 필요한다. Prometheus는 이러한 목적으로 널리 사용되는 오픈소스 시계열 데이터베이스이다.

### 3.1 Prometheus 설정

Prometheus를 Kubernetes에 설치하고 Istio 메트릭을 수집하도록 구성하는 방법은 다음과 같다:

```bash
# Prometheus 설치
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prom prometheus-community/kube-prometheus-stack -n prometheus
```

Prometheus Operator를 사용하면 ServiceMonitor와 PodMonitor 리소스를 통해 메트릭 수집 대상을 정의할 수 있다:

```yaml
# 컨트롤 플레인 메트릭 수집을 위한 ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istio-component-monitor
  namespace: prometheus
spec:
  selector:
    matchExpressions:
    - {key: istio, operator: In, values: [pilot]}
  namespaceSelector:
    any: true
  endpoints:
  - port: http-monitoring
    interval: 15s
```

![](https://velog.velcdn.com/images/juwon8891/post/5b1153cd-8818-472c-866b-b0250bb6e6ba/image.png)

```yaml
# 데이터 플레인 메트릭 수집을 위한 PodMonitor
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: envoy-stats-monitor
  namespace: prometheus
spec:
  selector:
    matchExpressions:
    - {key: istio-prometheus-ignore, operator: DoesNotExist}
  namespaceSelector:
    any: true
  podMetricsEndpoints:
  - path: /stats/prometheus
    interval: 15s
    relabelings:
    - action: keep
      sourceLabels: [__meta_kubernetes_pod_container_name]
      regex: "istio-proxy"
```
![](https://velog.velcdn.com/images/juwon8891/post/e0ac35c8-5ba1-4c27-94b7-daf119a765ef/image.png)

## 4. 메트릭 커스터마이징

### 4.1 기존 메트릭 커스터마이징

Istio에서는 기존 메트릭의 디멘션을 추가하거나 제거할 수 있다:

```yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  values:
    telemetry:
      v2:
        prometheus:
          configOverride:
            inboundSidecar:
              metrics:
              - name: requests_total
                dimensions:
                  upstream_proxy_version: upstream_peer.istio_version
                  source_mesh_id: node.metadata['MESH_ID']
                tags_to_remove:
                - request_protocol
```

![](https://velog.velcdn.com/images/juwon8891/post/566d24f7-67c0-483b-b328-b3208cb16fd4/image.png)

### 4.2 새로운 메트릭 생성

특정 요구사항에 맞는 새로운 메트릭을 정의할 수도 있다:

```yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  values:
    telemetry:
      v2:
        prometheus:
          configOverride:
            inboundSidecar:
              definitions:
              - name: get_calls
                type: COUNTER
                value: "(request.method.startsWith('GET') ? 1 : 0)"
```
![](https://velog.velcdn.com/images/juwon8891/post/39769582-f542-469e-a1a0-f002cb195cee/image.png)

### 4.3 새 속성으로 호출 그룹화

attribute-gen 플러그인을 사용하여 새로운 속성을 만들고 이를 메트릭에 활용할 수 있다:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: attribute-gen-example
spec:
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: SIDECAR_OUTBOUND
      listener:
        filterChain:
          filter:
            name: envoy.filters.network.http_connection_manager
            subFilter:
              name: istio.stats
    patch:
      operation: INSERT_BEFORE
      value:
        name: istio.attributegen
        typed_config:
          '@type': type.googleapis.com/udpa.type.v1.TypedStruct
          type_url: type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm
          value:
            config:
              configuration:
                '@type': type.googleapis.com/google.protobuf.StringValue
                value: |
                  {
                    "attributes": [
                      {
                        "output_attribute": "istio_operationId",
                        "match": [
                         {
                           "value": "getitems",
                           "condition": "request.url_path == '/items' && request.method == 'GET'"
                         }
                       ]
                      }
                    ]
                  }
```

![](https://velog.velcdn.com/images/juwon8891/post/0f4c802c-0857-4ac9-b6df-02e4bfc8a2b8/image.png)

## 실습: 메트릭 수집 및 설정

### 1. 실습 환경 구성

먼저 Kubernetes 클러스터와 Istio를 설치한다:

```bash
# kind 클러스터 생성
kind create cluster --name myk8s --image kindest/node:v1.23.17 --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000 # Sample Application (istio-ingrssgateway) HTTP
    hostPort: 30000
  - containerPort: 30001 # Prometheus
    hostPort: 30001
  - containerPort: 30002 # Grafana
    hostPort: 30002
  - containerPort: 30003 # Kiali
    hostPort: 30003
  - containerPort: 30004 # Tracing
    hostPort: 30004
  - containerPort: 30005 # Sample Application (istio-ingrssgateway) HTTPS
    hostPort: 30005
  kubeadmConfigPatches:
  - |
    kind: ClusterConfiguration
    controllerManager:
      extraArgs:
        bind-address: 0.0.0.0
networking:
  podSubnet: 10.10.0.0/16
  serviceSubnet: 10.200.1.0/24
EOF

# Istio 설치
export ISTIOV=1.17.8
curl -s -L https://istio.io/downloadIstio | ISTIO_VERSION=$ISTIOV sh -
cp istio-$ISTIOV/bin/istioctl /usr/local/bin/istioctl
istioctl install --set profile=default -y

# 실습을 위한 네임스페이스 설정
kubectl create ns istioinaction
kubectl label namespace istioinaction istio-injection=enabled

# istio-ingressgateway 서비스 설정
kubectl patch svc -n istio-system istio-ingressgateway -p '{"spec": {"type": "NodePort", "ports": [{"port": 80, "targetPort": 8080, "nodePort": 30000}]}}'
kubectl patch svc -n istio-system istio-ingressgateway -p '{"spec": {"type": "NodePort", "ports": [{"port": 443, "targetPort": 8443, "nodePort": 30005}]}}'
kubectl patch svc -n istio-system istio-ingressgateway -p '{"spec":{"externalTrafficPolicy": "Local"}}'
```

### 2. 샘플 애플리케이션 배포

```bash
# catalog 앱 기동
kubectl apply -f services/catalog/kubernetes/catalog.yaml -n istioinaction

# webapp 앱 기동
kubectl apply -f services/webapp/kubernetes/webapp.yaml -n istioinaction

# gateway, virtualservice 설정
kubectl apply -f services/webapp/istio/webapp-catalog-gw-vs.yaml -n istioinaction

# 호출테스트
curl -s http://webapp.istioinaction.io:30000
curl -s http://webapp.istioinaction.io:30000/api/catalog | jq
```

### 3. 기본 메트릭 확인

Istio 프록시가 수집하는 기본 메트릭을 확인한다:

```bash
# 서비스의 사이드카 프록시가 유지하는 메트릭 확인
kubectl exec -it deploy/catalog -c istio-proxy -n istioinaction -- curl localhost:15000/stats
kubectl exec -it deploy/webapp -c istio-proxy -n istioinaction -- curl localhost:15000/stats

# istio_requests_total 메트릭 확인
kubectl exec -it deploy/webapp -c istio-proxy -n istioinaction -- curl localhost:15000/stats | grep istio_requests_total
```

### 4. 더 많은 Envoy 통계 수집 설정

특정 업스트림 클러스터에 대한 더 많은 메트릭을 수집하도록 설정할 수 있다:

```bash
# webapp 디플로이먼트에 애노테이션 추가
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: webapp
  name: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      annotations:
        proxy.istio.io/config: |-
          proxyStatsMatcher:
            inclusionPrefixes:
            - "cluster.outbound|80||catalog.istioinaction"
      labels:
        app: webapp
    spec:
      containers:
      - env:
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        image: istioinaction/webapp:latest
        imagePullPolicy: IfNotPresent
        name: webapp
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        securityContext:
          privileged: false
EOF

# 호출 테스트 후 추가 메트릭 확인
curl -s http://webapp.istioinaction.io:30000/api/catalog | jq
```

### 5. Prometheus 설정

Prometheus를 설치하고 Istio 메트릭을 수집하도록 구성한다:

```bash
# Prometheus 설치
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

cat <<EOF > prom-values.yaml
prometheusOperator:
  tls:
    enabled: false
  admissionWebhooks:
    patch:
      enabled: false

prometheus:
  service:
    type: NodePort
    nodePort: 30001
    
grafana:
  service:
    type: NodePort
    nodePort: 30002
EOF

kubectl create ns prometheus
helm install prom prometheus-community/kube-prometheus-stack --version 13.13.1 \
  -n prometheus -f prom-values.yaml

# Istio 컨트롤 플레인 메트릭 수집 설정
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istio-component-monitor
  namespace: prometheus
  labels:
    monitoring: istio-components
    release: prom
spec:
  jobLabel: istio
  targetLabels: [app]
  selector:
    matchExpressions:
    - {key: istio, operator: In, values: [pilot]}
  namespaceSelector:
    any: true
  endpoints:
  - port: http-monitoring
    interval: 15s
EOF

# Istio 데이터 플레인 메트릭 수집 설정
cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: envoy-stats-monitor
  namespace: prometheus
  labels:
    monitoring: istio-proxies
    release: prom
spec:
  selector:
    matchExpressions:
    - {key: istio-prometheus-ignore, operator: DoesNotExist}
  namespaceSelector:
    any: true
  jobLabel: envoy-stats
  podMetricsEndpoints:
  - path: /stats/prometheus
    interval: 15s
    relabelings:
    - action: keep
      sourceLabels: [__meta_kubernetes_pod_container_name]
      regex: "istio-proxy"
    - action: keep
      sourceLabels: [__meta_kubernetes_pod_annotationpresent_prometheus_io_scrape]
    - sourceLabels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
      action: replace
      regex: ([^:]+)(?::\d+)?;(\d+)
      replacement: $1:$2
      targetLabel: __address__
    - action: labeldrop
      regex: "__meta_kubernetes_pod_label_(.+)"
    - sourceLabels: [__meta_kubernetes_namespace]
      action: replace
      targetLabel: namespace
    - sourceLabels: [__meta_kubernetes_pod_name]
      action: replace
      targetLabel: pod_name
EOF

# Prometheus 웹 UI 접속
echo "Prometheus UI: http://localhost:30001"
```

### 6. 커스텀 메트릭 생성

새로운 메트릭을 정의하고 수집해봅시다:

```bash
# 새 메트릭 정의 (GET 요청 카운터)
cat <<EOF > istio-operator-new-metric.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  profile: demo
  values:
    telemetry:
      v2:
        prometheus:
          configOverride:
            inboundSidecar:
              definitions:
              - name: get_calls
                type: COUNTER
                value: "(request.method.startsWith('GET') ? 1 : 0)"
            outboundSidecar:
              definitions:
              - name: get_calls
                type: COUNTER
                value: "(request.method.startsWith('GET') ? 1 : 0)"
            gateway:
              definitions:
              - name: get_calls
                type: COUNTER
                value: "(request.method.startsWith('GET') ? 1 : 0)"
EOF

istioctl install -f istio-operator-new-metric.yaml -y

# webapp 디플로이먼트에 새 메트릭 포함 설정
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: webapp
  name: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      annotations:
        proxy.istio.io/config: |-
          proxyStatsMatcher:
            inclusionPrefixes:
            - "istio_get_calls"
      labels:
        app: webapp
    spec:
      containers:
      - env:
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        image: istioinaction/webapp:latest
        imagePullPolicy: IfNotPresent
        name: webapp
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        securityContext:
          privileged: false
EOF

# 호출 테스트 후 새 메트릭 확인
for i in {1..10}; do curl -s http://webapp.istioinaction.io:30000/api/catalog; sleep 0.5; done
kubectl exec -it deploy/webapp -c istio-proxy -n istioinaction -- curl localhost:15000/stats/prometheus | grep istio_get_calls
```

### 7. 새 속성으로 호출 그룹화

특정 API 엔드포인트 호출을 식별하는 커스텀 속성을 만들어봅니다:

```bash
# attribute-gen 플러그인 설정
cat <<EOF | kubectl apply -f -
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: attribute-gen-example
  namespace: istioinaction
spec:
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: SIDECAR_OUTBOUND
      listener:
        filterChain:
          filter:
            name: envoy.filters.network.http_connection_manager
            subFilter:
              name: istio.stats
      proxy:
        proxyVersion: ^1\.17.*
    patch:
      operation: INSERT_BEFORE
      value:
        name: istio.attributegen
        typed_config:
          '@type': type.googleapis.com/udpa.type.v1.TypedStruct
          type_url: type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm
          value:
            config:
              configuration:
                '@type': type.googleapis.com/google.protobuf.StringValue
                value: |
                  {
                    "attributes": [
                      {
                        "output_attribute": "istio_operationId",
                        "match": [
                         {
                           "value": "getitems",
                           "condition": "request.url_path == '/items' && request.method == 'GET'"
                         },
                         {
                           "value": "createitem",
                           "condition": "request.url_path == '/items' && request.method == 'POST'"
                         },     
                         {
                           "value": "deleteitem",
                           "condition": "request.url_path == '/items' && request.method == 'DELETE'"
                         }                                             
                       ]
                      }
                    ]
                  }
              vm_config:
                code:
                  local:
                    inline_string: envoy.wasm.attributegen
                runtime: envoy.wasm.runtime.null
EOF

# 새 디멘션 추가
cat <<EOF > istio-operator-new-attribute.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
spec:
  profile: demo
  values:
    telemetry:
      v2:
        prometheus:
          configOverride:
            outboundSidecar:
              metrics:
              - name: requests_total
                dimensions:
                  upstream_operation: istio_operationId
EOF

istioctl install -f istio-operator-new-attribute.yaml -y

# 호출 테스트 후 새 디멘션 확인
for i in {1..10}; do curl -s http://webapp.istioinaction.io:30000/api/catalog; sleep 0.5; done
kubectl exec -it deploy/webapp -c istio-proxy -n istioinaction -- curl localhost:15000/stats/prometheus | grep istio_requests_total | grep upstream_operation
```

이제 Prometheus UI(http://localhost:30001)에서 `istio_requests_total{upstream_operation!=""}` 쿼리를 실행하여 새 디멘션이 적용된 메트릭을 확인할 수 있다.

## 시각화 도구 활용

Istio에서 수집한 메트릭과 트레이스 데이터를 시각화하는 방법을 다룬다. Grafana, Jaeger, Kiali를 활용하면 서비스 메시의 동작을 직관적으로 이해하고 문제를 신속하게 진단할 수 있다.

## 1. Grafana를 사용한 메트릭 시각화

수집된 메트릭은 Grafana를 통해 시각화할 수 있다. Istio는 다양한 대시보드 템플릿을 제공한다:

- Istio Mesh Dashboard: 메시 전체 상태 개요
- Istio Service Dashboard: 특정 서비스의 성능 및 상태
- Istio Workload Dashboard: 워크로드별 메트릭
- Istio Control Plane Dashboard: 컨트롤 플레인 성능 및 상태

## 실습: Grafana 설정 및 대시보드 활용

### 1. Grafana 설치 및 구성

앞서 Prometheus 설치 시 함께 설치된 Grafana를 사용한다:

```bash
# Grafana 접속 확인 (기본 계정: admin / prom-operator)
open http://localhost:30002
```

### 2. Istio 대시보드 가져오기

Istio 대시보드를 Grafana에 추가한다:

```bash
# Istio 대시보드 ConfigMap 생성
kubectl -n prometheus create cm istio-dashboards \
--from-file=pilot-dashboard.json=ch8/dashboards/pilot-dashboard.json \
--from-file=istio-workload-dashboard.json=ch8/dashboards/istio-workload-dashboard.json \
--from-file=istio-service-dashboard.json=ch8/dashboards/istio-service-dashboard.json \
--from-file=istio-performance-dashboard.json=ch8/dashboards/istio-performance-dashboard.json \
--from-file=istio-mesh-dashboard.json=ch8/dashboards/istio-mesh-dashboard.json \
--from-file=istio-extension-dashboard.json=ch8/dashboards/istio-extension-dashboard.json

# Grafana가 ConfigMap을 인식하도록 레이블 지정
kubectl label -n prometheus cm istio-dashboards grafana_dashboard=1
```
![](https://velog.velcdn.com/images/juwon8891/post/6b30f489-cc5b-41bd-aaf5-bcb3207d687f/image.png)

### 3. 대시보드 사용법 및 해석

Grafana에 로그인한 후 대시보드 메뉴에서 Istio 대시보드를 확인할 수 있다:

1. **Istio Control Plane Dashboard**:
   - 컨트롤 플레인의 CPU, 메모리 사용량
   - xDS 업데이트 횟수 및 지연 시간
   - 활성 프록시 수
   - 설정 동기화 상태

   ```bash
   # 컨트롤 플레인 메트릭 쿼리 예시
   sum(irate(pilot_xds_pushes{type="rds"}[1m]))  # RDS 업데이트 비율
   ```

2. **Istio Service Dashboard**:
   - 서비스별 요청 수, 성공률, 지연 시간
   - 클라이언트/서버 측 메트릭
   - TCP 연결 및 바이트 전송량

   ```bash
   # 서비스 메트릭 쿼리 예시
   sum(rate(istio_requests_total{destination_service=~"$service", reporter="destination"}[1m])) by (response_code)  # 응답 코드별 요청 수
   ```

3. **Istio Workload Dashboard**:
   - 워크로드별 인바운드/아웃바운드 트래픽
   - 요청 볼륨, 성공률, 지연 시간
   - 서비스 의존성

### 4. 트래픽 생성 및 대시보드 확인

대시보드에 데이터를 표시하기 위해 트래픽을 생성한다:

```bash
# 반복 호출로 트래픽 생성
while true; do 
  curl -s http://webapp.istioinaction.io:30000/api/catalog
  date "+%Y-%m-%d %H:%M:%S"
  sleep 1
  echo
done
```

![](https://velog.velcdn.com/images/juwon8891/post/76b2a859-1485-4eae-bd19-0e06256c4b83/image.png)

Grafana에서 다음 대시보드를 확인해보세요:
- Istio Mesh Dashboard: 메시 전체 상태
- Istio Service Dashboard: webapp 및 catalog 서비스 선택
- Istio Workload Dashboard: webapp 및 catalog 워크로드 선택
- Istio Control Plane Dashboard: 컨트롤 플레인 성능

### 5. 대시보드 커스터마이징

Grafana에서는 기존 대시보드를 복제하여 커스터마이징할 수 있다:

1. 대시보드 우측 상단의 설정(⚙️) 아이콘 클릭
2. "Save As" 선택하여 새 이름으로 저장
3. 패널 추가, 수정, 삭제 등을 통해 커스터마이징
4. 특정 메트릭에 대한 알림 설정 가능

예를 들어, 다음과 같은 커스텀 패널을 추가할 수 있다:
- 특정 API 엔드포인트의 성공률
- 특정 서비스의 P95 지연 시간 추이
- 커스텀 메트릭(예: istio_get_calls) 시각화

## 2. 분산 트레이싱과 Jaeger

더 많은 애플리케이션을 마이크로서비스로 구축할수록, 비즈니스 목표를 달성하기 위해 협업하는 분산 구성 요소의 네트워크를 만들어가게 된다. **요청 경로에서 문제가 발생**하기 시작하면, **무슨 일이 일어나고 있는지 이해**하는 것은 매우 중요한다. 그래야 빠르게 진단하고 고칠 수 있기 때문이다.

분산 트레이싱은 요청이 여러 서비스를 통과하는 경로를 추적하여 시스템의 동작을 이해하고 문제를 진단하는 데 도움을 준다. 이 개념은 구글 대퍼(Google Dapper) 논문 'Dapper, a Large-Scale Distributed Systems Tracing Infrastructure (2010)'에서 도입되었다.

### 2.1 분산 트레이싱 작동 방식

가장 단순한 형태의 오픈트레이싱을 활용한 분산 트레이싱은 애플리케이션이 **스팬**을 생성하고, 이를 오픈트레이싱 **엔진과 공유**하며, 뒤이어 호출하는 서비스로 **트레이스 콘텍스트**를 **전파**하는 것으로 이뤄집니다.

분산 트레이싱의 핵심 개념:

- **스팬(Span)**: 서비스나 구성 요소 내에서 **작업 단위**를 나타내는 **데이터 모음**이다. 이 데이터에는 작업 시작 시각, 종료 시각, 작업 이름, 태그 및 로그 집합 등이 포함된다.
- **트레이스(Trace)**: 여러 스팬의 집합으로, 서비스 간의 인과 관계를 나타내며 방향, 타이밍과 기타 디버깅 정보를 보여준다.
- **트레이스 ID**: 트레이스를 고유하게 식별하는 ID
- **스팬 ID**: 스팬을 고유하게 식별하는 ID

이러한 ID들은 서비스 간의 작업 **상관관계를 파악**하는 데 사용되며 **서비스 간에 전파**돼야 한다.

Istio는 요청이 프록시를 통과할 때 트레이싱 헤더를 자동으로 추가한다:
- **x-request-id**
- x-b3-traceid
- x-b3-spanid
- x-b3-parentspanid
- x-b3-sampled
- x-b3-flags
- x-ot-span-context

이스티오가 제공하는 분산 트레이싱 기능이 요청 호출 그래프 전체에 걸쳐 작동하려면, 각 **애플리케이션이 이 헤더들을 자신이 하는 모든 호출에 전파**해야 한다. 이스티오는 어떤 호출이 어떤 수신 요청의 결과물인지 모르기 때문이다.

**오픈트레이싱 구현체**에는 다음과 같은 시스템들이 있다:
- 예거(Jaeger)
- 집킨(Zipkin)
- 라이트스텝(Lightstep)
- 인스타나(Instana)

이스티오는 **스팬을 분산 트레이싱 엔진으로 보낼 수** 있으므로, 이 작업을 위해 **언어 전용 라이브러리나 애플리케이션 전용 설정이 필요 없**다.

## 실습: Jaeger 설정 및 트레이스 분석

### 1. Jaeger 설치

Jaeger를 Kubernetes 클러스터에 설치한다:

```bash
# Jaeger 설치
kubectl apply -f istio-$ISTIOV/samples/addons/jaeger.yaml

# 설치 확인
kubectl get deploy,pod,svc -n istio-system -l app=jaeger

# NodePort 설정
kubectl patch svc -n istio-system tracing -p '{"spec": {"type": "NodePort", "ports": [{"port": 80, "targetPort": 16686, "nodePort": 30004}]}}'

# Jaeger UI 접속
open http://localhost:30004
```

### 2. 트레이싱 설정

Istio에서 분산 트레이싱을 활성화하고 설정한다:

```bash
# 트레이싱 설정 확인
kubectl describe cm -n istio-system istio

# 트레이싱 설정 업데이트 (샘플링 비율 100%)
cat <<EOF > install-istio-tracing-zipkin.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  namespace: istio-system
spec:
  meshConfig:
    defaultConfig:
      tracing:
        sampling: 100
        zipkin:
          address: zipkin.istio-system:9411
EOF

istioctl install -y -f install-istio-tracing-zipkin.yaml

# 설정 확인
kubectl describe cm -n istio-system istio | grep -A3 tracing
```

### 3. 트레이스 헤더 확인

Istio가 자동으로 추가하는 트레이스 헤더를 확인한다:

```bash
# 외부 서비스 호출을 위한 VirtualService 설정
cat <<EOF | kubectl apply -n istioinaction -f -
apiVersion: networking.istio.io/v1alpha3
kind: Gateway
metadata:
  name: coolstore-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "webapp.istioinaction.io"
    - "httpbin.istioinaction.io"
---
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: thin-httbin-virtualservice
spec:
  hosts:
  - "httpbin.istioinaction.io"
  gateways:
  - coolstore-gateway
  http:
  - route:
    - destination:
        host: httpbin.org
---        
apiVersion: networking.istio.io/v1alpha3
kind: ServiceEntry
metadata:
  name: external-httpbin-org
spec:
  hosts:
  - httpbin.org 
  ports:
  - number: 80
    name: http
    protocol: HTTP
  location: MESH_EXTERNAL
  resolution: DNS
EOF

# /etc/hosts 파일에 도메인 추가
echo "127.0.0.1       httpbin.istioinaction.io" | sudo tee -a /etc/hosts

# 트레이스 헤더 확인
curl -s http://httpbin.istioinaction.io:30000/headers | jq
```
![](https://velog.velcdn.com/images/juwon8891/post/9358642c-bd4f-4d7d-b75b-85694a637c75/image.png)

응답에서 다음과 같은 트레이스 헤더를 확인할 수 있다:
- `X-B3-Traceid`: 트레이스 ID
- `X-B3-Spanid`: 스팬 ID
- `X-B3-Sampled`: 샘플링 여부

### 4. 트레이스 생성 및 분석

트래픽을 생성하고 Jaeger에서 트레이스를 분석한다:

```bash
# 트래픽 생성
for i in {1..10}; do 
  curl -s http://webapp.istioinaction.io:30000/api/catalog
  sleep 0.5
done
```

Jaeger UI(http://localhost:30004)에서 다음 단계로 트레이스를 분석한다:

1. 서비스 선택: 왼쪽 상단 드롭다운에서 `istio-ingressgateway` 선택
2. 트레이스 검색: "Find Traces" 버튼 클릭
3. 트레이스 상세 보기: 특정 트레이스 클릭하여 상세 정보 확인
   - 서비스 간 호출 경로
   - 각 스팬의 지연 시간
   - 스팬 태그 및 로그

![](https://velog.velcdn.com/images/juwon8891/post/9e4a7934-c7fb-4370-b16c-22129ea3311f/image.png)

### 5. 트레이스 샘플링 설정

운영 환경에서는 모든 요청을 트레이싱하는 것이 부담될 수 있으므로, 샘플링 비율을 조정할 수 있다:

```bash
# 샘플링 비율 변경 (10%)
kubectl edit -n istio-system cm istio
# sampling: 100 -> sampling: 10 으로 변경

# 변경 적용을 위해 istio-ingressgateway 재시작
kubectl rollout restart deploy -n istio-system istio-ingressgateway

# 워크로드별 샘플링 설정
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: webapp
  name: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      annotations:
        proxy.istio.io/config: |
          tracing:
            sampling: 50
            zipkin:
              address: zipkin.istio-system:9411
      labels:
        app: webapp
    spec:
      containers:
      - env:
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        image: istioinaction/webapp:latest
        name: webapp
        ports:
        - containerPort: 8080
          name: http
EOF
```

### 6. 특정 요청에 대한 트레이싱 강제

특정 요청에 대해서만 트레이싱을 강제할 수 있다:

```bash
# x-envoy-force-trace 헤더를 사용하여 트레이싱 강제
curl -s -H "x-envoy-force-trace: true" http://webapp.istioinaction.io:30000/api/catalog -v
```
![](https://velog.velcdn.com/images/juwon8891/post/038c098d-1b5c-4d0c-9562-18dc8c688ee9/image.png)

### 7. 커스텀 태그 추가

트레이스에 커스텀 태그를 추가하여 더 많은 정보를 제공할 수 있다:

```bash
# 커스텀 태그 추가
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: webapp
  name: webapp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      annotations:
        proxy.istio.io/config: |
          tracing:
            sampling: 100
            customTags:
              custom_tag:
                literal:
                  value: "Test Tag"
            zipkin:
              address: zipkin.istio-system:9411
      labels:
        app: webapp
    spec:
      containers:
      - env:
        - name: KUBERNETES_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        image: istioinaction/webapp:latest
        name: webapp
        ports:
        - containerPort: 8080
          name: http
EOF

# 트래픽 생성
for i in {1..10}; do 
  curl -s http://webapp.istioinaction.io:30000/api/catalog
  sleep 0.5
done
```

![](https://velog.velcdn.com/images/juwon8891/post/d5ffdd84-8751-4282-91e5-57e14bcb1bd4/image.png)

Jaeger UI에서 트레이스를 확인하면 `custom_tag`가 추가된 것을 볼 수 있다.

## 3. Kiali를 사용한 서비스 메시 시각화

이스티오는 오픈소스 프로젝트 키알리(Kiali)의 강력한 시각화 대시보드를 함께 사용할 수 있는데, 이는 런타임에 서비스 메시를 이해하는 데 도움을 줄 수 있다. 키알리는 프로메테우스와 기반 플랫폼에서 많은 양의 메트릭을 가져와 메시 내 구성 요소의 런타임 그래프를 구성하는데, 이 그래프가 서비스 간의 **통신 상황을 시각적**으로 이해하는 데 도움이 된다.

키알리는 그라파나와 다른데, 키알리는 **실시간으로 갱신되는 메트릭**을 사용해 **서비스가 서로 어떻게 통신하는지에 대한 방향 그래프** directed graph 를 구축하는데 집중하기 때문이다. 그라파나는 게이지, 카운터, 차트 등이 포함된 대시보드에는 훌륭하지만, 클러스터 내 서비스에 대한 상호작용형 그림이나 지도를 보여주지는 않다.

### 3.1 Kiali의 주요 기능

Kiali는 다음과 같은 기능을 제공한다:

- **그래프 시각화**: 서비스 간 통신을 방향 그래프로 표시
  - 트래픽의 이동과 흐름
  - 바이트 수, 요청 개수 등
  - 여러 버전에 대한 여러 트래픽 흐름(예: 카나리 릴리스나 가중치 라우팅)
  - 초당 요청 수; 총량 대비 여러 버전의 트래픽 비율
  - 네트워크 트래픽에 기반한 애플리케이션 상태
  - HTTP/TCP 트래픽
  - 빠르게 식별할 수 있는 네트워크 실패

- **워크로드 정보**: 워크로드의 상세 정보 제공
  - Overview: 서비스의 파드, 적용된 Istio 설정, 업스트림 및 다운스트림 그래프
  - Traffic: 인바운드 및 아웃바운드 트래픽의 성공률
  - Logs: 애플리케이션 로그, Envoy 액세스 로그, 스팬과의 상관관계
  - Traces: Jaeger에서 보고된 트레이스
  - Envoy: 워크로드에 적용된 Envoy 설정(클러스터, 리스너, 라우트 등)

- **설정 검증**: Istio 설정 오류 감지
  - 존재하지 않는 Gateway를 가리키는 VirtualService
  - 존재하지 않는 대상으로의 라우팅
  - 동일한 호스트에 대한 여러 VirtualService
  - 찾을 수 없는 서비스 서브셋

## 실습: Kiali 설정 및 활용

### 1. Kiali 설치

Kiali 오퍼레이터를 설치하고 Kiali 인스턴스를 배포한다:

```bash
# Kiali 오퍼레이터 설치
helm repo add kiali https://kiali.org/helm-charts
helm repo update
helm install --namespace kiali-operator --create-namespace --version 1.63.2 kiali-operator kiali/kiali-operator

# 설치 확인
kubectl get pod -n kiali-operator

# Kiali 인스턴스 배포
cat <<EOF | kubectl apply -f -
apiVersion: kiali.io/v1alpha1
kind: Kiali
metadata:
  namespace: istio-system
  name: kiali
spec:
  istio_namespace: "istio-system"  
  istio_component_namespaces:
    prometheus: prometheus
  auth:    
    strategy: anonymous
  deployment:
    accessible_namespaces:
    - '**'
  external_services:    
    prometheus:
      cache_duration: 10
      cache_enabled: true
      cache_expiration: 300
      url: "http://prom-kube-prometheus-stack-prometheus.prometheus:9090"    
    tracing:
      enabled: true
      in_cluster_url: "http://tracing.istio-system:16685/jaeger"
      use_grpc: true
EOF

# 설치 확인
kubectl get deploy,svc -n istio-system kiali

# NodePort 설정
kubectl patch svc -n istio-system kiali -p '{"spec": {"type": "NodePort", "ports": [{"port": 20001, "targetPort": 20001, "nodePort": 30003}]}}'

# Kiali UI 접속
open http://localhost:30003
```

### 2. 트래픽 생성

Kiali 대시보드에 데이터를 표시하기 위해 트래픽을 생성한다:

```bash
# 반복 호출로 트래픽 생성
while true; do 
  curl -s http://webapp.istioinaction.io:30000/api/catalog
  date "+%Y-%m-%d %H:%M:%S"
  sleep 1
  echo
done
```

![](https://velog.velcdn.com/images/juwon8891/post/2f4d4e23-eb32-44f0-a41f-8d2fbb39ca9d/image.png)

### 3. Kiali 대시보드 탐색

Kiali UI(http://localhost:30003)에 접속하여 다음 기능을 탐색한다:

#### 3.1 Overview 대시보드

Overview 대시보드에서는 네임스페이스와 각 네임스페이스에서 실행 중인 애플리케이션의 개수를 확인할 수 있다:

1. 왼쪽 메뉴에서 "Overview" 선택
2. istioinaction 네임스페이스 선택
3. 애플리케이션, 워크로드, 서비스 수 확인

![](https://velog.velcdn.com/images/juwon8891/post/4e7c1f6c-c27d-4910-b4d0-bd20d3e772cd/image.png)

#### 3.2 Graph 시각화

Graph 메뉴에서는 서비스 메시의 트래픽 흐름을 시각적으로 확인할 수 있다:

1. 왼쪽 메뉴에서 "Graph" 선택
2. 네임스페이스 필터에서 "istioinaction" 선택
3. Display 설정:
   - Traffic Animation 활성화
   - Service Nodes 표시
   - Security 표시
   - Operation Nodes 표시

Graph에서 다음 정보를 확인할 수 있다:
- 서비스 간 트래픽 흐름
- 요청 볼륨 및 성공률
- 보안 정책(mTLS) 적용 여부
- 서비스 간 지연 시간

#### 3.3 워크로드 상세 정보

워크로드의 상세 정보를 확인한다:

1. 왼쪽 메뉴에서 "Workloads" 선택
2. webapp 워크로드 클릭
3. 다음 탭 확인:
   - Overview: 파드 상태, Istio 설정, 의존성 그래프
   - Traffic: 인바운드/아웃바운드 트래픽 성공률
   - Logs: 애플리케이션 및 Envoy 로그
   - Traces: Jaeger 트레이스 연동
   - Envoy: Envoy 설정 및 메트릭

#### 3.4 서비스 상세 정보

서비스의 상세 정보를 확인한다:

1. 왼쪽 메뉴에서 "Services" 선택
2. catalog 서비스 클릭
3. 서비스 상세 정보 확인:
   - 클라이언트/서버 측 메트릭
   - 요청 볼륨, 지연 시간, 크기
   - 응답 코드 분포

#### 3.5 Istio 설정 검증

Kiali는 Istio 설정의 문제를 자동으로 감지한다:

1. 왼쪽 메뉴에서 "Istio Config" 선택
2. 설정 오류 확인 (경고 또는 오류 아이콘)
3. 설정 상세 정보 확인

![](https://velog.velcdn.com/images/juwon8891/post/519eed1c-490a-4a69-ba01-3830dfe75ce4/image.png)

### 4. 고급 기능 활용

#### 4.1 서비스 그래프 분석

Graph 메뉴에서 다양한 분석 기능을 활용한다:

1. 그래프 레이아웃 변경: Dagre, Cola, Cose
2. 트래픽 지표 변경: 요청 볼륨, 응답 시간, 성공률
3. Edge 레이블 변경: 응답 시간, 요청 볼륨, 프로토콜
4. 그래프 필터링: 특정 응답 코드, 지연 시간 임계값

#### 4.2 워크로드 상태 모니터링

Health 기능을 사용하여 워크로드 상태를 모니터링한다:

1. Overview 메뉴에서 Health 열 확인
2. 상태 아이콘 의미:
   - 녹색: 정상
   - 노란색: 경고
   - 빨간색: 오류

#### 4.3 트레이스와 로그 연동

Kiali에서 트레이스와 로그를 함께 분석한다:

1. Workloads 메뉴에서 webapp 선택
2. Traces 탭 선택
3. 특정 트레이스 클릭
4. 관련 로그 확인

![](https://velog.velcdn.com/images/juwon8891/post/58129f03-5b6f-4f09-a8a0-aa1f94d0cd1a/image.png)

#### 5.2 성능 문제 분석

1. 지연 시간이 긴 요청 식별:
   - Graph 메뉴에서 Edge 레이블을 "Response Time" 으로 설정
   - 지연 시간이 긴 경로 확인

2. 트레이스로 상세 분석:
   - 해당 서비스의 Traces 탭에서 지연 시간이 긴 트레이스 확인
   - 스팬별 지연 시간 분석

![](https://velog.velcdn.com/images/juwon8891/post/7145c0e9-55be-423f-a76b-c50ef9dd480a/image.png)

### 6. Kiali와 다른 도구 통합

Kiali는 다른 관찰 가능성 도구와 통합된다:

1. **Prometheus 통합**:
   - 메트릭 데이터 소스로 사용
   - 그래프 및 대시보드에 메트릭 표시

2. **Jaeger 통합**:
   - 트레이스 데이터 연동
   - 워크로드 및 서비스 페이지에서 트레이스 확인

3. **Grafana 통합**:
   - 서비스 및 워크로드 페이지에서 Grafana 대시보드 링크
   - 상세 메트릭 분석

## 4. 결론 및 모범 사례 {: .no-toc }

Istio의 관찰 가능성 기능과 시각화 도구를 활용하면 복잡한 마이크로서비스 환경에서도 시스템의 동작을 이해하고 문제를 신속하게 해결할 수 있다. 다음은 Istio 관찰 가능성을 활용하기 위한 몇 가지 모범 사례이다:

1. **통합된 관찰 가능성 전략 수립**: 메트릭, 로그, 트레이스를 통합적으로 활용하여 시스템을 모니터링하세요.

2. **적절한 샘플링 비율 설정**: 운영 환경에서는 트레이스 샘플링 비율을 낮게 설정하고, 필요할 때 특정 요청에 대해 트레이싱을 강제하세요.

3. **애플리케이션 트레이스 헤더 전파**: 분산 트레이싱이 제대로 작동하려면 애플리케이션이 트레이스 헤더를 전파해야 한다.

4. **대시보드 커스터마이징**: Grafana와 Kiali 대시보드를 팀의 요구사항에 맞게 커스터마이징하세요.

5. **알림 설정**: 중요 메트릭에 대한 알림을 설정하여 문제를 조기에 감지하세요.

## 참고 {: .no-toc }

- [Envoy 1.19.0 공식 문서](https://www.envoyproxy.io/docs/envoy/v1.19.0/)
- [Istio 1.17 공식 문서](https://istio.io/v1.17/docs/)
- [Istio 공식 문서 - 관찰 가능성](https://istio.io/latest/docs/tasks/observability/)
- [Prometheus 공식 문서](https://prometheus.io/docs/introduction/overview/)
- [Jaeger 공식 문서](https://www.jaegertracing.io/docs/1.22/)
- [Kiali 공식 문서](https://kiali.io/docs/)
- [OpenTelemetry 공식 문서](https://opentelemetry.io/docs/)

