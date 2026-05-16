---
tags:
  - Istio
  - Scaling
---

# Istio - 스케일링, 데이터 플레인 확장

> Istio 컨트롤 플레인 수평 확장과 Envoy 필터를 활용한 데이터 플레인 기능 확장 방법을 정리한다.

다중 클러스터 서비스 메시 구성과 Envoy 필터·WebAssembly를 활용한 데이터 플레인 확장을 다룬다.

| 학습 항목 | 내용 |
|-----------|------|
| 글로벌 스케일링 | 여러 리전, 여러 클라우드에 걸친 서비스 메시 구축 방법 |
| 고급 커스터마이징 | 표준 Istio 기능으로는 불가능한 특별한 요구사항을 해결하는 방법 |
| 엔터프라이즈 운영 | 실제 기업 환경에서 안정적으로 서비스 메시를 운영하는 방법 |

![](https://velog.velcdn.com/images/juwon8891/post/a7269b16-3424-4181-9c85-c979bb1d9334/image.png)

---

## 조직 내에서 이스티오 스케일링하기

### 다중 클러스터 서비스 메시의 주요 이점

다중 클러스터 구조로 전환하는 이유는 **현대 비즈니스의 현실적 요구사항**에 있다.

#### 격리성 강화 (Improved Isolation): 팀 간 충돌 방지

실제 기업 환경에서는 여러 팀이 동시에 개발하고 배포한다. 단일 클러스터에서는:

```bash
# 문제 상황 예시: 개발팀 A의 잘못된 배포가 전체 클러스터에 영향
kubectl apply -f bad-config.yaml  # 전체 클러스터의 네트워크 정책 손상
# 결과: 모든 팀의 서비스가 영향을 받음
```

다중 클러스터 환경에서는:
- **팀별 클러스터 분리**: 개발팀 A는 `dev-cluster-a`, 개발팀 B는 `dev-cluster-b` 사용
- **폭발 반경 제한**: 한 팀의 실수가 다른 팀에게 영향을 주지 않음
- **독립적인 업데이트**: 각 팀이 자신의 속도로 Kubernetes 버전, Istio 버전 업그레이드 가능

> **참고**: 다수의 개발자가 있는 조직에서는 클러스터 분리를 고려해야 한다. 혼재된 환경에서는 예기치 못한 장애가 연쇄적으로 발생할 확률이 높아집니다.

#### 장애 경계 (Failure Boundary): 비즈니스 연속성 보장

실제 금융 서비스 회사에서 겪은 사례이다:

```yaml
# 단일 클러스터에서의 위험한 설정 변경
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: global-policy
  namespace: istio-system  # 전체 메시에 영향!
spec:
  rules:
  - to:
    - operation:
        methods: ["GET"]  # POST 요청 차단 -> 전체 서비스 마비!
```

다중 클러스터 설계에서는:
- **클러스터별 정책 범위 제한**: 한 클러스터의 설정 오류가 다른 클러스터에 전파되지 않음
- **점진적 롤아웃**: 새로운 정책을 한 클러스터에서 먼저 테스트한 후 점진적으로 확산
- **빠른 복구**: 문제 발생 시 트래픽을 정상 클러스터로 즉시 라우팅

#### 규정 준수 (Regulatory and Compliance): 법적 요구사항 충족

GDPR, HIPAA, SOX 같은 규정들은 단순히 권고사항이 아닙니다. 실제 사례를 보겠다:

```bash
# EU 사용자 데이터는 반드시 EU 리전에서만 처리
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: eu-cluster-setup
  namespace: istio-system
spec:
  values:
    global:
      meshID: eu-mesh
      multiCluster:
        clusterName: eu-west-cluster
        network: eu-network
      # EU 규정 준수를 위한 특별 설정
      defaultConfig:
        proxyMetadata:
          GDPR_COMPLIANT: "true"
          DATA_RESIDENCY: "EU"
```

- **지역별 데이터 격리**: EU 고객 데이터는 EU 클러스터에서만 처리
- **규정 감사 추적**: 클러스터별로 독립적인 감사 로그 관리
- **컴플라이언스 인증**: 각 지역의 법적 요구사항에 맞는 별도 인증 획득

#### 가용성 및 성능 향상: 글로벌 서비스의 필수 요소

Netflix, Amazon과 같은 글로벌 서비스들이 사용하는 전략:

```yaml
# 지역별 클러스터 구성 예시
# US-West 클러스터
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  annotations:
    service.istio.io/preferred-region: "us-west"
    service.istio.io/locality-weight: "80"  # 80% 로컬 트래픽
spec:
  # 서비스 정의

---
# EU-West 클러스터  
apiVersion: v1
kind: Service
metadata:
  name: catalog-service
  annotations:
    service.istio.io/preferred-region: "eu-west"
    service.istio.io/locality-weight: "80"
```

**실제 성능 지표**:
- **레이턴시 개선**: 글로벌 사용자 대비 평균 레이턴시 60% 감소
- **가용성 향상**: 99.9%에서 99.99%로 향상 (연간 다운타임 8.76시간 → 52.56분)
- **사용자 경험**: 지역별 최적화된 서비스 제공

#### 다중 및 하이브리드 클라우드: 벤더 락인 방지와 비용 최적화

실제 사례: 대형 소매업체의 하이브리드 클라우드 전략

```bash
# AWS 클러스터 (신규 서비스)
export CLUSTER_CONTEXT="aws-prod-cluster"
kubectl config use-context $CLUSTER_CONTEXT

# Azure 클러스터 (레거시 서비스)  
export CLUSTER_CONTEXT="azure-legacy-cluster"
kubectl config use-context $CLUSTER_CONTEXT

# 온프레미스 클러스터 (민감한 금융 데이터)
export CLUSTER_CONTEXT="onprem-secure-cluster"
kubectl config use-context $CLUSTER_CONTEXT
```

**전략적 이점**:
- **비용 최적화**: 워크로드별로 가장 비용 효율적인 클라우드 선택
- **벤더 의존성 제거**: 하나의 클라우드 프로바이더에 종속되지 않음
- **재해 복구**: 한 클라우드의 장애 시 다른 클라우드로 페일오버

> **참고**: 다중 클라우드 전략을 활용하면 워크로드 특성에 따라 최적의 클라우드를 선택하여 비용을 절감할 수 있다. 컴퓨팅 집약적인 작업은 가격이 저렴한 클라우드로, 네트워크 집약적인 작업은 지연시간이 낮은 클라우드로 배치하는 방식이다.

### 다중 클러스터 서비스 메시 아키텍처

다중 클러스터 구성에서 어떤 배포 모델을 선택하느냐에 따라 운영 복잡성, 성능, 보안이 크게 달라집니다.

#### Istio 다중 클러스터 배포 모델 비교

**1. 단일 컨트롤 플레인 (Primary-Remote)**

```yaml
# Primary 클러스터 (us-west)
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: control-plane-primary
spec:
  values:
    global:
      meshID: production-mesh
      multiCluster:
        clusterName: us-west-primary
        network: us-west-network
    pilot:
      env:
        EXTERNAL_ISTIOD: true  # 원격 클러스터 지원

---
# Remote 클러스터 (us-east)
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: remote-cluster
spec:
  values:
    global:
      meshID: production-mesh
      multiCluster:
        clusterName: us-east-remote
        network: us-east-network
      remotePilotAddress: ${PRIMARY_CLUSTER_PILOT_ADDRESS}
    istiodRemote:
      enabled: true
```

**장점**:
- **중앙화된 관리**: 모든 정책과 설정을 한 곳에서 관리
- **일관성 보장**: 단일 제어점으로 구성 불일치 최소화
- **리소스 효율성**: 컨트롤 플레인 중복 없음

**단점**:
- **단일 장애점**: Primary 클러스터 장애 시 전체 메시 영향
- **네트워크 의존성**: Remote 클러스터가 Primary에 지속적으로 연결되어야 함
- **지연시간**: 원격 클러스터의 설정 변경 지연

**2. 복제된 컨트롤 플레인 (Primary-Primary)**

```yaml
# West 클러스터 설정
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: west-control-plane
spec:
  values:
    global:
      meshID: production-mesh
      multiCluster:
        clusterName: west-cluster
        network: west-network
      # 양방향 클러스터 검색 활성화
      enableCrossClusterWorkloadEntry: true

---
# East 클러스터 설정 
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: east-control-plane
spec:
  values:
    global:
      meshID: production-mesh  # 동일한 메시 ID!
      multiCluster:
        clusterName: east-cluster
        network: east-network
      enableCrossClusterWorkloadEntry: true
```

**장점**:
- **고가용성**: 한 클러스터 장애 시에도 다른 클러스터는 독립 운영
- **지역 자율성**: 각 클러스터가 독립적으로 운영되어 지연시간 최소화
- **확장성**: 새로운 클러스터 추가가 더 용이

**단점**:
- **관리 복잡성**: 여러 컨트롤 플레인의 일관성 유지 필요
- **리소스 오버헤드**: 각 클러스터마다 완전한 컨트롤 플레인 필요
- **설정 동기화**: 수동으로 설정을 동기화해야 하는 경우 발생

#### 메시 연합 vs 다중 클러스터 메시: 선택 기준

**메시 연합 (Mesh Federation) 적합한 시나리오**:

```bash
# 조직별로 독립적인 메시 운영
# 보안팀 메시
kubectl create namespace security-mesh-system
kubectl label namespace security-mesh-system istio.io/mesh-id=security-mesh

# 개발팀 메시  
kubectl create namespace dev-mesh-system
kubectl label namespace dev-mesh-system istio.io/mesh-id=dev-mesh

# 메시 간 선택적 통신만 허용
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: inter-mesh-policy
spec:
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/security-mesh-system/sa/gateway-service"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/validate"]
```

**다중 클러스터 서비스 메시 적합한 시나리오**:

```yaml
# 전역적으로 통합된 서비스 디스커버리
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: global-catalog-service
spec:
  hosts:
  - catalog.production.svc.cluster.local
  http:
  - match:
    - headers:
        region:
          exact: "us-west"
    route:
    - destination:
        host: catalog.production.svc.cluster.local
        subset: us-west-cluster
  - route:  # 기본 라우팅
    - destination:
        host: catalog.production.svc.cluster.local
        subset: us-east-cluster
```

#### 네트워크 토폴로지와 워크로드 디스커버리

**다중 네트워크 시나리오**에서는 클러스터 간 Pod가 직접 통신할 수 없기 때문에 East-West 게이트웨이가 필요한다:

```bash
# 네트워크 연결성 테스트
kubectl exec -it test-pod -- ping 10.20.0.15  # 다른 클러스터 Pod IP
# 실패 -> East-West 게이트웨이 필요

# 단일 네트워크 시나리오 (네이티브 라우팅)
kubectl exec -it test-pod -- ping 10.20.0.15  # 다른 클러스터 Pod IP  
# 성공 -> 직접 통신 가능
```

**워크로드 디스커버리 원리**:

```yaml
# 클러스터 간 서비스 엔드포인트 공유
apiVersion: v1
kind: Secret
metadata:
  name: istio-remote-secret-east-cluster
  namespace: istio-system
  labels:
    istio/cluster: east-cluster
type: Opaque
data:
  east-cluster: <base64-encoded-kubeconfig>  # East 클러스터 접근 정보
```

이 시크릿을 통해 West 클러스터의 istiod가 East 클러스터의 서비스를 발견하고 Envoy 설정에 포함시킵니다.

![](https://velog.velcdn.com/images/juwon8891/post/c8002c41-2ee0-43d0-ab46-23af55f15c62/image.png)

### 다중 클러스터 배포 실습

실습 시나리오: 글로벌 전자상거래 플랫폼 시뮬레이션
- **West 클러스터**: 미국 서부 (webapp 서비스 운영)
- **East 클러스터**: 미국 동부 (catalog 서비스 운영)

#### Step 1: 실습 환경 구성 - 지역 분산 아키텍처

```bash

# West 클러스터 생성 (US-West 리전 시뮬레이션)
cat << 'EOF' > west-cluster-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000 # istio-ingressgateway HTTP
    hostPort: 30000
  - containerPort: 30001 # Prometheus
    hostPort: 30001
  - containerPort: 30002 # Grafana
    hostPort: 30002
  - containerPort: 30003 # Kiali
    hostPort: 30003
  - containerPort: 30004 # Tracing
    hostPort: 30004
networking:
  podSubnet: 10.10.0.0/16      # West 클러스터 전용 Pod 대역
  serviceSubnet: 10.100.0.0/24  # West 클러스터 서비스 대역
EOF

kind create cluster --name west --image kindest/node:v1.23.17 \
  --kubeconfig ./west-kubeconfig --config west-cluster-config.yaml

# East 클러스터 생성 (US-East 리전 시뮬레이션)
cat << 'EOF' > east-cluster-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 31000 # istio-ingressgateway HTTP
    hostPort: 31000
  - containerPort: 31001 # Prometheus
    hostPort: 31001
  - containerPort: 31002 # Grafana
    hostPort: 31002
  - containerPort: 31003 # Kiali
    hostPort: 31003
  - containerPort: 31004 # Tracing
    hostPort: 31004
networking:
  podSubnet: 10.20.0.0/16      # East 클러스터 전용 Pod 대역
  serviceSubnet: 10.200.0.0/24  # East 클러스터 서비스 대역
EOF

kind create cluster --name east --image kindest/node:v1.23.17 \
  --kubeconfig ./east-kubeconfig --config east-cluster-config.yaml
```

**환경 확인 및 네트워크 테스트**:
```bash
# 클러스터 생성 확인
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -E "(west|east)"

# kubectl 컨텍스트 설정
kubectl config set-context west-context --cluster=kind-west --user=kind-west
kubectl config set-context east-context --cluster=kind-east --user=kind-east

# 각 클러스터의 네트워크 확인
echo "=== West 클러스터 네트워크 정보 ==="
kubectl --kubeconfig=./west-kubeconfig get nodes -o wide
kubectl --kubeconfig=./west-kubeconfig get pods -n kube-system -o wide | head -3

echo "=== East 클러스터 네트워크 정보 ==="
kubectl --kubeconfig=./east-kubeconfig get nodes -o wide
kubectl --kubeconfig=./east-kubeconfig get pods -n kube-system -o wide | head -3

# 클러스터 간 네트워크 분리 확인 (예상: 실패)
docker exec west-control-plane ping -c 1 east-control-plane 2>/dev/null || echo "O 클러스터 간 네트워크 분리 확인됨"
```

#### Step 2: 공통 신뢰 기반 구축 - 인증서 관리

다중 클러스터 서비스 메시에서 **공통 신뢰(Common Trust)**는 필수적이다. 클러스터 간 상호 인증을 위해 동일한 루트 CA를 사용해야 한다.

```bash
# 편의를 위한 alias 설정
alias kwest='kubectl --kubeconfig=./west-kubeconfig'
alias keast='kubectl --kubeconfig=./east-kubeconfig'

# 공통 CA 인증서 생성 (프로덕션에서는 실제 CA 사용)
mkdir -p certs
cd certs

# 루트 CA 생성
openssl req -x509 -newkey rsa:4096 -keyout root-ca-key.pem -out root-ca-cert.pem \
  -days 365 -nodes -subj "/C=US/ST=CA/L=SanFrancisco/O=ACME/CN=ACME Root CA"

# 중간 CA 생성 (각 클러스터용)
# West 클러스터용 중간 CA
openssl req -newkey rsa:4096 -keyout west-ca-key.pem -out west-ca-csr.pem \
  -nodes -subj "/C=US/ST=CA/L=SanFrancisco/O=ACME/CN=ACME West Intermediate CA"
openssl x509 -req -in west-ca-csr.pem -CA root-ca-cert.pem -CAkey root-ca-key.pem \
  -CAcreateserial -out west-ca-cert.pem -days 365

# East 클러스터용 중간 CA
openssl req -newkey rsa:4096 -keyout east-ca-key.pem -out east-ca-csr.pem \
  -nodes -subj "/C=US/ST=NY/L=NewYork/O=ACME/CN=ACME East Intermediate CA"
openssl x509 -req -in east-ca-csr.pem -CA root-ca-cert.pem -CAkey root-ca-key.pem \
  -CAcreateserial -out east-ca-cert.pem -days 365

# 인증서 체인 생성
cat west-ca-cert.pem root-ca-cert.pem > west-cert-chain.pem
cat east-ca-cert.pem root-ca-cert.pem > east-cert-chain.pem

cd ..
```

**Step 3: Istio 컨트롤 플레인 설치 - 복제된 컨트롤 플레인 모델**

```bash
# istioctl 다운로드 (각 클러스터 컨테이너에)
export ISTIO_VERSION=1.17.8
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=$ISTIO_VERSION sh -
sudo cp istio-$ISTIO_VERSION/bin/istioctl /usr/local/bin/

# West 클러스터 설정
cat << 'EOF' > west-istio-config.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: west-controlplane
  namespace: istio-system
spec:
  profile: demo
  components:
    egressGateways:
    - name: istio-egressgateway
      enabled: false  # 실습에서는 비활성화
  values:
    global:
      meshID: acme-production-mesh  # 글로벌 메시 ID
      multiCluster:
        clusterName: west-cluster   # 클러스터 고유 식별자
        network: west-network       # 네트워크 식별자
      # 메시 네트워크 토폴로지 정의
      meshNetworks:
        west-network:
          endpoints:
          - fromRegistry: west-cluster
          gateways:
          - address: 172.18.255.200  # East-West 게이트웨이 주소 (나중에 설정)
            port: 15443
        east-network:
          endpoints:
          - fromRegistry: east-cluster
          gateways:
          - address: 172.18.255.201
            port: 15443
EOF

# East 클러스터 설정
cat << 'EOF' > east-istio-config.yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: east-controlplane
  namespace: istio-system
spec:
  profile: demo
  components:
    egressGateways:
    - name: istio-egressgateway
      enabled: false
  values:
    global:
      meshID: acme-production-mesh  # 동일한 메시 ID
      multiCluster:
        clusterName: east-cluster
        network: east-network
      meshNetworks:
        west-network:
          endpoints:
          - fromRegistry: west-cluster
          gateways:
          - address: 172.18.255.200
            port: 15443
        east-network:
          endpoints:
          - fromRegistry: east-cluster
          gateways:
          - address: 172.18.255.201
            port: 15443
EOF
```

**실제 설치 실행**:
```bash
# 네임스페이스 생성 및 CA 인증서 배포
kwest create namespace istio-system
keast create namespace istio-system

# 공통 CA 인증서 배포
kwest create secret generic cacerts -n istio-system \
  --from-file=certs/root-ca-cert.pem \
  --from-file=certs/west-cert-chain.pem \
  --from-file=certs/west-ca-cert.pem \
  --from-file=certs/west-ca-key.pem

keast create secret generic cacerts -n istio-system \
  --from-file=certs/root-ca-cert.pem \
  --from-file=certs/east-cert-chain.pem \
  --from-file=certs/east-ca-cert.pem \
  --from-file=certs/east-ca-key.pem

# Istio 설치
istioctl install --kubeconfig=./west-kubeconfig -f west-istio-config.yaml -y
istioctl install --kubeconfig=./east-kubeconfig -f east-istio-config.yaml -y

# 부가 도구 설치
kwest apply -f istio-$ISTIO_VERSION/samples/addons/
keast apply -f istio-$ISTIO_VERSION/samples/addons/
```

**설치 확인 및 상태 점검**:
```bash
# 컨트롤 플레인 파드 상태 확인
echo "=== West 클러스터 Istio 구성 요소 ==="
kwest get pods -n istio-system
kwest get istiooperator -n istio-system

echo "=== East 클러스터 Istio 구성 요소 ==="
keast get pods -n istio-system  
keast get istiooperator -n istio-system

# 인증서 확인
echo "=== 인증서 체인 확인 ==="
kwest get secret cacerts -n istio-system -o jsonpath='{.data.cert-chain\.pem}' | base64 -d | openssl x509 -text -noout | grep "Issuer:"
keast get secret cacerts -n istio-system -o jsonpath='{.data.cert-chain\.pem}' | base64 -d | openssl x509 -text -noout | grep "Issuer:"

# istiod 버전 확인
kwest exec -n istio-system deploy/istiod -- pilot-discovery version
keast exec -n istio-system deploy/istiod -- pilot-discovery version
```
![](https://velog.velcdn.com/images/juwon8891/post/c586e27b-b3a2-46ab-ab64-2328adf06af1/image.png)

> **참고**: 프로덕션 환경에서는 Hardware Security Module(HSM)이나 외부 PKI 시스템을 사용하여 CA 키를 보호해야 한다. 또한 인증서 순환(rotation) 정책을 수립하고 자동화해야 한다.

#### Step 4: 클러스터 간 워크로드 디스커버리 설정

각 클러스터가 상대방의 워크로드를 발견할 수 있도록 시크릿을 생성:

```bash
# East 클러스터의 시크릿을 West 클러스터에 생성
istioctl create-remote-secret \
  --context=east \
  --name=east-cluster | \
  kubectl apply -f - --context=west

# West 클러스터의 시크릿을 East 클러스터에 생성
istioctl create-remote-secret \
  --context=west \
  --name=west-cluster | \
  kubectl apply -f - --context=east
```

![](https://velog.velcdn.com/images/juwon8891/post/11243036-15bd-495a-a338-a65a8b95f539/image.png)

#### Step 5: East-West 게이트웨이 설정

클러스터 간 통신을 위한 East-West 게이트웨이 구성:

```yaml
apiVersion: install.istio.io/v1alpha1
kind: IstioOperator
metadata:
  name: istio-eastwestgateway
  namespace: istio-system
spec:
  profile: empty
  components:
    ingressGateways:
    - name: istio-eastwestgateway
      label:
        istio: eastwestgateway
        app: istio-eastwestgateway
      enabled: true
      k8s:
        env:
        - name: ISTIO_META_ROUTER_MODE
          value: "sni-dnat"  # SNI 클러스터 활성화
        - name: ISTIO_META_REQUESTED_NETWORK_VIEW
          value: east-network
```

![](https://velog.velcdn.com/images/juwon8891/post/a7dd9022-83ba-4101-9f3c-62d4ca63e2de/image.png)

#### SNI 클러스터와 자동 통과

East-West 게이트웨이는 **SNI(Server Name Indication) 클러스터**를 사용하여:
- 모든 엔보이 클러스터 정보를 SNI에 인코딩
- 암호화된 트래픽을 적절한 클러스터로 라우팅
- 상호 인증된 연결 유지

### Step 6: 실습 결과 확인

```bash
# 클러스터 간 서비스 디스커버리 확인
kubectl get endpoints catalog -n istioinaction --context=west
kubectl get endpoints catalog -n istioinaction --context=east

# East-West 트래픽 테스트
curl -H "Host: webapp.istioinaction.io" http://west-cluster-ip/api/catalog
```
![](https://velog.velcdn.com/images/juwon8891/post/5f38e8e4-5ba4-4e8f-bdcb-c7f1c9fe1e6e/image.png)

---

## 이스티오의 요청 처리 기능 확장하기

### 엔보이의 확장 기능

**데이터 플레인 확장이 필요한 이유**

Istio의 표준 기능만으로는 모든 비즈니스 요구사항을 충족할 수 없다. 예를 들어 모든 API 호출에 대해 특별한 암호화된 거래 ID를 헤더에 추가해야 하는 경우처럼, 복잡한 알고리즘이 필요한 요구사항은 Envoy의 **확장 가능한 아키텍처**로 해결한다.

#### Envoy 필터 체인 아키텍처

```
     ┌─────────────────────────────────────────────┐
     │           Listener                          │
     │  (Port 8080에서 들어오는 요청 수신)           │
     └─────────────────────┬───────────────────────┘
                           │
     ┌─────────────────────▼───────────────────────┐
     │         Network Filter Chain               │
     │  ┌─────────────────────────────────────┐    │
     │  │    MongoDB Filter                  │    │
     │  ├─────────────────────────────────────┤    │
     │  │    Redis Filter                    │    │
     │  ├─────────────────────────────────────┤    │
     │  │    HTTP Connection Manager (HCM)   │ ←──┼── 가장 중요!
     │  └─────────────────────────────────────┘    │
     └─────────────────────┬───────────────────────┘
                           │
     ┌─────────────────────▼───────────────────────┐
     │         HTTP Filter Chain                  │
     │  ┌─────────────────────────────────────┐    │
     │  │    CORS Filter                     │    │
     │  ├─────────────────────────────────────┤    │
     │  │    JWT Authentication Filter       │    │
     │  ├─────────────────────────────────────┤    │
     │  │    Rate Limiting Filter            │    │
     │  ├─────────────────────────────────────┤    │
     │  │    Custom Business Logic Filter    │ ←──┼── 우리가 추가할 곳!
     │  ├─────────────────────────────────────┤    │
     │  │    Router Filter (Terminal)        │    │
     │  └─────────────────────────────────────┘    │
     └─────────────────────┬───────────────────────┘
                           │
     ┌─────────────────────▼───────────────────────┐
     │         Upstream Cluster                   │
     │      (실제 백엔드 서비스로 전달)             │
     └─────────────────────────────────────────────┘
```

**각 계층의 역할과 확장 가능성**:

1. **리스너 (Listener)**: 
   - 네트워크 인터페이스 바인딩
   - 확장 포인트: 사용자 정의 리스너 필터

2. **네트워크 필터**: 
   - 바이트 스트림 처리
   - 확장 포인트: TCP/UDP 레벨 커스터마이징

3. **HTTP Connection Manager**: 
   - HTTP 프로토콜 파싱
   - 확장 포인트: HTTP 레벨 커스터마이징

4. **HTTP 필터**: 
   - 요청/응답 처리
   - 확장 포인트: **가장 많이 사용되는 확장 영역**

#### 실전에서 자주 사용되는 HTTP 필터들

```yaml
# 실제 프로덕션에서 사용되는 필터 체인 예시
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: production-filter-chain
  namespace: payment-service
spec:
  workloadSelector:
    labels:
      app: payment-api
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: SIDECAR_INBOUND
      listener:
        filterChain:
          filter:
            name: "envoy.filters.network.http_connection_manager"
    patch:
      operation: INSERT_BEFORE
      filterClass: AUTHZ  # 인증 전에 실행
      value:
        name: envoy.filters.http.cors
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
          allow_origin_string_match:
          - prefix: "https://secure-"
          allow_methods: "GET, POST, PUT"
          allow_headers: "authorization, content-type, x-transaction-id"
```

**주요 필터 카테고리별 사용 사례**:

- **보안 필터**:
  - `envoy.filters.http.jwt_authn`: JWT 토큰 검증
  - `envoy.filters.http.rbac`: 역할 기반 접근 제어
  - `envoy.filters.http.ext_authz`: 외부 인증 서비스 연동

- **관찰성 필터**:
  - `envoy.filters.http.wasm`: WebAssembly 기반 메트릭 수집
  - `envoy.filters.http.tap`: 디버깅을 위한 트래픽 캡처
  - `envoy.access_loggers.file`: 상세 액세스 로그

- **트래픽 제어 필터**:
  - `envoy.filters.http.local_ratelimit`: 로컬 속도 제한
  - `envoy.filters.http.fault`: 결함 주입 테스트
  - `envoy.filters.http.adaptive_concurrency`: 적응적 동시성 제어

- **데이터 변환 필터**:
  - `envoy.filters.http.grpc_json_transcoder`: gRPC ↔ JSON 변환
  - `envoy.filters.http.lua`: Lua 스크립트 실행
  - `envoy.filters.http.header_to_metadata`: 헤더 → 메타데이터 변환

> **설계 원칙**: 각 필터는 단일 책임 원칙을 따르며, 체인을 통해 조합된다. 이는 마이크로서비스 아키텍처와 유사한 철학이다.

![](https://velog.velcdn.com/images/juwon8891/post/1ac1bc21-4d44-4b39-9bea-cabbe0baadac/image.png)

### EnvoyFilter 리소스로 엔보이 필터 설정하기

#### 위험 요소와 모범 사례

EnvoyFilter는 **강력하지만 위험한 도구**이다. 잘못 사용하면 전체 서비스 메시가 중단될 수 있다.

```bash
# 실제 장애 사례: 잘못된 EnvoyFilter로 인한 서비스 중단
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: dangerous-filter  # 위험한 설정 예시
  namespace: istio-system  # 😱 전체 메시에 적용!
spec:
  # workloadSelector 없음 = 모든 워크로드에 적용
  configPatches:
  - applyTo: HTTP_FILTER
    patch:
      operation: INSERT_BEFORE
      value:
        name: envoy.filters.http.nonexistent_filter  # 😱 존재하지 않는 필터!
```

**안전한 EnvoyFilter 개발 워크플로우**:

1. **개발 환경에서 테스트**
2. **특정 워크로드로 범위 제한**
3. **카나리 배포 적용**
4. **모니터링 및 롤백 계획 수립**

#### 실습: Tap 필터 구현

**Step 1: 안전한 실습 환경 구성**
```bash
# 실습용 네임스페이스 생성
kubectl create namespace tap-debug-lab
kubectl label namespace tap-debug-lab istio-injection=enabled

# 테스트 애플리케이션 배포
cat << 'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: debug-webapp
  namespace: tap-debug-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: debug-webapp
      version: v1
  template:
    metadata:
      labels:
        app: debug-webapp
        version: v1
    spec:
      containers:
      - name: webapp
        image: nginx:latest
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: debug-webapp
  namespace: tap-debug-lab
spec:
  selector:
    app: debug-webapp
  ports:
  - port: 80
    targetPort: 80
EOF
```

**Step 2: 점진적 Tap 필터 배포**
```yaml
# 프로덕션급 Tap 필터 설정
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: safe-tap-filter
  namespace: tap-debug-lab
spec:
  workloadSelector:
    labels:
      app: debug-webapp  # 특정 앱에만 적용
      version: v1        # 특정 버전에만 적용
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: SIDECAR_INBOUND
      listener:
        portNumber: 80
      filterChain:
        filter:
          name: "envoy.filters.network.http_connection_manager"
        subFilter:
          name: "envoy.filters.http.router"
    patch:
      operation: INSERT_BEFORE
      value:
        name: envoy.filters.http.tap
        typed_config:
          "@type": "type.googleapis.com/envoy.extensions.filters.http.tap.v3.Tap"
          commonConfig:
            adminConfig:
              configId: debug_tap_config
            # 보안을 위한 제한 설정
            maxBufferedRxBytes: 1024    # 수신 버퍼 제한
            maxBufferedTxBytes: 1024    # 송신 버퍼 제한
            streaming: true             # 스트리밍 모드 활성화
```

**Step 3: 실시간 디버깅 실행**
```bash
# Tap 설정 JSON 파일 생성
cat << 'EOF' > debug-tap-config.json
{
  "config_id": "debug_tap_config",
  "tap_config": {
    "match_config": {
      "http_request_headers_match": {
        "headers": [
          {
            "name": "x-debug-session",
            "exact_match": "enabled"
          }
        ]
      }
    },
    "output_config": {
      "sinks": [
        {
          "streaming_admin": {}
        }
      ]
    }
  }
}
EOF

# 포트 포워딩 및 Tap 활성화
kubectl port-forward -n tap-debug-lab deploy/debug-webapp 15000:15000 &
curl -X POST -d @debug-tap-config.json \
  -H "Content-Type: application/json" \
  http://localhost:15000/tap

# 디버그 요청 전송 (별도 터미널)
kubectl port-forward -n tap-debug-lab svc/debug-webapp 8080:80 &
curl -H "x-debug-session: enabled" \
  -H "x-trace-id: 12345" \
  http://localhost:8080/
```

![](https://velog.velcdn.com/images/juwon8891/post/7862951b-ea13-42f2-ac5c-0b65110b6d98/image.png)

### 고급 확장 기법: Lua와 WebAssembly

#### Lua 스크립트: 빠른 프로토타이핑

Lua는 **빠른 개발과 유연성**이 필요할 때 적합한다:

```lua
-- 요청 헤더에 비즈니스 로직 추가
function envoy_on_request(request_handle)
  -- 사용자 지역 감지
  local user_ip = request_handle:headers():get("x-forwarded-for")
  local region = detect_region(user_ip)
  
  -- 지역별 라우팅 헤더 추가
  request_handle:headers():add("x-user-region", region)
  
  -- 비즈니스 시간 확인
  local current_hour = os.date("!%H")
  if tonumber(current_hour) < 9 or tonumber(current_hour) > 17 then
    request_handle:headers():add("x-business-hours", "false")
  else
    request_handle:headers():add("x-business-hours", "true")
  end
end
```

![](https://velog.velcdn.com/images/juwon8891/post/3d931630-73ba-4812-9bc9-3f52f5835f83/image.png)

#### WebAssembly: 고성능 확장

WASM은 **성능이 중요한 프로덕션 환경**에서 사용한다:

```rust
// Rust로 작성된 고성능 필터 예시
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

#[no_mangle]
pub fn _start() {
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_http_context(|_| -> Box<dyn HttpContext> {
        Box::new(CustomAuthFilter)
    });
}

struct CustomAuthFilter;

impl HttpContext for CustomAuthFilter {
    fn on_http_request_headers(&mut self, _num_headers: usize) -> Action {
        // 고성능 인증 로직
        let auth_header = self.get_http_request_header("authorization");
        
        match validate_token_fast(&auth_header) {
            Ok(user_info) => {
                self.add_http_request_header("x-user-id", &user_info.id);
                Action::Continue
            },
            Err(_) => {
                self.send_http_response(401, vec![], Some(b"Unauthorized"));
                Action::Pause
            }
        }
    }
}
```

**Lua vs WASM 선택 기준**:

| 기준 | Lua | WebAssembly |
|------|-----|-------------|
| **개발 속도** | 빠름 | 보통 |
| **성능** | 보통 | 높음 |
| **메모리 사용량** | 낮음 | 보통 |
| **디버깅** | 쉬움 | 어려움 |
| **보안** | 보통 | 높음 |

> **실무 권장사항**: 
> - **프로토타이핑과 간단한 로직**: Lua 사용
> - **프로덕션 고성능 요구사항**: WebAssembly 사용
> - **복잡한 비즈니스 로직**: 별도 마이크로서비스로 분리 고려

---

## 핵심 포인트 정리

### 다중 클러스터 스케일링

| 항목 | 내용 |
|------|------|
| 격리성과 가용성 | 다중 클러스터 구성으로 팀 간 충돌 및 장애 전파 방지 |
| East-West 게이트웨이 | 클러스터 간 안전한 mTLS 통신 |
| SNI 클러스터 | 세밀한 트래픽 라우팅 지원 |
| 공통 신뢰 | 동일 루트 CA를 통한 클러스터 간 상호 인증 |

### 데이터 플레인 확장

| 항목 | 내용 |
|------|------|
| Envoy 필터 체인 | 계층별 확장 포인트 이해와 활용 |
| EnvoyFilter 리소스 | 고급 Envoy 설정 적용 |
| Lua와 WebAssembly | 커스텀 비즈니스 로직 구현 |
| Tap 필터 | 실시간 트래픽 디버깅 |

---


다중 클러스터 서비스 메시는 격리성, 장애 경계, 규정 준수, 가용성 향상을 위한 핵심 아키텍처 패턴이다. Envoy 필터와 WebAssembly를 활용한 데이터 플레인 확장을 통해 표준 Istio 기능으로 충족하기 어려운 비즈니스 요구사항을 구현할 수 있다.
