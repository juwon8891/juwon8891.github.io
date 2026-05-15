---
tags:
  - RKE2
  - Cluster API
---

# RKE2 & Cluster API

> **Week 7 학습 주제**: Rancher Government의 보안 강화 Kubernetes 배포판 RKE2와 선언적 클러스터 관리를 위한 Cluster API를 학습한다.

---

## RKE2 소개

### 1. RKE2

**RKE2 (RKE Government)** = **Rancher Kubernetes Engine 2**

- Rancher에서 개발한 **보안 강화** Kubernetes 배포판
- **미국 연방 정부** 요구사항 충족 (FIPS 140-2, STIG)
- **CIS Kubernetes Benchmark** 기본 준수
- RKE1의 후속 버전 (완전히 다시 작성)

### 2. RKE vs RKE2

| 특징 | RKE1 | RKE2 |
|------|------|------|
| **배포 방식** | Docker 컨테이너 기반 | systemd 서비스 기반 |
| **Container Runtime** | Docker | containerd (기본) |
| **설치 방법** | rke CLI | 바이너리 설치 |
| **보안 준수** | 선택적 | 기본 강화 (FIPS, CIS) |
| **etcd** | Docker 컨테이너 | Static Pod |
| **Control Plane** | Docker 컨테이너 | Static Pod |

### 3. 주요 특징

#### 3.1 Security First

```bash
# FIPS 140-2 준수 암호화 모듈 사용
# - TLS 1.2+ 강제
# - 승인된 암호화 알고리즘만 사용
# - NIST 표준 준수

```
#### 3.2 내장 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| CNI | Canal (Calico + Flannel) 기본, Cilium/Calico/Multus 선택 가능 |
| Ingress Controller | Nginx Ingress Controller |
| Service Load Balancer | Klipper LB (개발 환경용) |
| Metrics Server | 기본 포함 |
| CoreDNS | DNS 서버 |

#### 3.3 간편한 설치

```bash
# Server 노드 설치 (단일 명령)
curl -sfL https://get.rke2.io | sh -
systemctl enable rke2-server.service
systemctl start rke2-server.service

# Agent 노드 설치
curl -sfL https://get.rke2.io | INSTALL_RKE2_TYPE="agent" sh -
systemctl enable rke2-agent.service
systemctl start rke2-agent.service

```
### 4. 보안 강화 기능

#### 4.1 CIS Hardened

```yaml
# /etc/rancher/rke2/config.yaml
# CIS Profile 자동 적용
profile: cis-1.23

# 자동으로 적용되는 설정:
# - Pod Security Standards (Restricted)
# - Network Policies 활성화
# - Audit Logging 활성화
# - 안전한 kubelet 설정

```
#### 4.2 SELinux/AppArmor 지원

```bash
# SELinux (RHEL/CentOS)
setenforce 1
# RKE2가 자동으로 SELinux 정책 적용

# AppArmor (Ubuntu/Debian)
# RKE2가 자동으로 AppArmor 프로필 로드

```
#### 4.3 FIPS 140-2 모드

```bash
# FIPS 모드 활성화
export INSTALL_RKE2_FIPS=true
curl -sfL https://get.rke2.io | sh -

# 검증
rke2 --version
# rke2 version v1.28.x+rke2r1-fips

```

---

## RKE2 아키텍처

### 1. Server 노드 구성

**Server 노드** = Control Plane 노드

#### 컴포넌트 구성

```mermaid
graph TB
    subgraph "RKE2 Server Node"
        subgraph "systemd"
            RKE2S[rke2-server.service]
        end

        subgraph "Static Pods"
            ETCD[etcd]
            API[kube-apiserver]
            CM[kube-controller-manager]
            SCHED[kube-scheduler]
            CP[cloud-provider]
        end

        subgraph "Containerd"
            CONT[containerd]
            CNI[CNI Plugin<br/>Canal/Cilium]
            KUBELET[kubelet]
            PROXY[kube-proxy]
        end

        subgraph "Add-ons"
            NGINX[nginx-ingress]
            METRICS[metrics-server]
            COREDNS[coredns]
        end
    end

    RKE2S --> CONT
    RKE2S --> ETCD
    RKE2S --> API
    RKE2S --> CM
    RKE2S --> SCHED
    CONT --> KUBELET
    CONT --> CNI
    KUBELET --> PROXY
    KUBELET --> NGINX
    KUBELET --> METRICS
    KUBELET --> COREDNS

```
```bash
/var/lib/rancher/rke2/
├── agent/              # kubelet, containerd 데이터
├── bin/                # Kubernetes 바이너리
├── server/
│   ├── manifests/      # Static Pod 매니페스트
│   ├── tls/            # 인증서
│   └── token           # Node Join Token
└── etc/                # 설정 파일

```
### 2. Agent 노드 구성

**Agent 노드** = Worker 노드

#### 컴포넌트 구성

```mermaid
graph TB
    subgraph "RKE2 Agent Node"
        subgraph "systemd"
            RKE2A[rke2-agent.service]
        end

        subgraph "Containerd"
            CONT[containerd]
            CNI[CNI Plugin]
            KUBELET[kubelet]
            PROXY[kube-proxy]
        end

        subgraph "Workloads"
            POD1[Pod 1]
            POD2[Pod 2]
            POD3[Pod 3]
        end
    end

    RKE2A --> CONT
    RKE2A --> KUBELET
    KUBELET --> CNI
    KUBELET --> PROXY
    KUBELET --> POD1
    KUBELET --> POD2
    KUBELET --> POD3

```
### 3. 내장 컴포넌트

#### 3.1 CNI 옵션

```yaml
# /etc/rancher/rke2/config.yaml

# 옵션 1: Canal (기본값)
cni: canal

# 옵션 2: Cilium (eBPF 기반, 고성능)
cni: cilium

# 옵션 3: Calico (NetworkPolicy 강력)
cni: calico

# 옵션 4: Multus (Multi-NIC)
cni: multus,canal

# 옵션 5: CNI 없음 (수동 설치)
cni: none

```
#### 3.2 Ingress Controller

```yaml
# nginx-ingress (기본 포함)
# - NodePort 30080 (HTTP), 30443 (HTTPS)
# - HostPort 80, 443 (Bare-Metal)

# 비활성화
disable: rke2-ingress-nginx

```
#### 3.3 Service LoadBalancer

```yaml
# Klipper LB (개발 환경용)
# - NodePort를 호스트 포트로 포워딩
# - LoadBalancer Service 지원

# 비활성화 (MetalLB 등 사용 시)
disable: rke2-servicelb

```
### 4. 고가용성(HA) 구성

#### 4.1 Embedded etcd (권장)

```mermaid
graph TB
    subgraph "HA RKE2 Cluster"
        LB[Load Balancer<br/>192.168.56.10:9345]

        subgraph "Server 1"
            S1[rke2-server]
            E1[etcd]
        end

        subgraph "Server 2"
            S2[rke2-server]
            E2[etcd]
        end

        subgraph "Server 3"
            S3[rke2-server]
            E3[etcd]
        end

        A1[Agent 1]
        A2[Agent 2]
    end

    LB -.->|9345| S1
    LB -.->|9345| S2
    LB -.->|9345| S3

    E1 <-->|Raft| E2
    E2 <-->|Raft| E3
    E3 <-->|Raft| E1

    A1 -->|Join| LB
    A2 -->|Join| LB

```
**설정**:

```yaml
# Server 1 (First Node)
# /etc/rancher/rke2/config.yaml
cluster-init: true
tls-san:
  - rke2-server1
  - 192.168.56.11
  - 192.168.56.10  # VIP/LB

# Server 2, 3 (Additional Nodes)
# /etc/rancher/rke2/config.yaml
server: https://192.168.56.11:9345
token: K10xxx::server:yyy  # Server 1의 토큰
tls-san:
  - rke2-server2  # 각 노드명
  - 192.168.56.12  # 각 노드 IP
  - 192.168.56.10  # 공통 VIP/LB

```
#### 4.2 외부 Datastore (PostgreSQL/MySQL)

```yaml
# /etc/rancher/rke2/config.yaml
datastore-endpoint: "postgres://user:pass@host:5432/dbname"
# 또는
datastore-endpoint: "mysql://user:pass@tcp(host:3306)/dbname"

```

---

## RKE2 설치 및 구성

### 1. Server 노드 설치

#### 1.1 시스템 준비

```bash
# 방화벽 포트 오픈
firewall-cmd --permanent --add-port=6443/tcp  # K8s API
firewall-cmd --permanent --add-port=9345/tcp  # RKE2 Supervisor
firewall-cmd --permanent --add-port=10250/tcp # Kubelet
firewall-cmd --permanent --add-port=2379-2380/tcp  # etcd
firewall-cmd --reload

# SELinux Permissive (선택)
setenforce 0
sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config

# Swap 비활성화
swapoff -a
sed -i '/ swap / s/^/#/' /etc/fstab

```
#### 1.2 RKE2 설치

```bash
# RKE2 설치 스크립트 다운로드 및 실행
curl -sfL https://get.rke2.io | sh -

# 설치 확인
ls -l /usr/local/bin/rke2
rke2 --version

```
#### 1.3 설정 파일 작성

```bash
# /etc/rancher/rke2/config.yaml
mkdir -p /etc/rancher/rke2
cat > /etc/rancher/rke2/config.yaml <<EOF
# Server 설정
write-kubeconfig-mode: "0644"
tls-san:
  - "rke2-server1"
  - "192.168.56.11"

# CNI 선택
cni: cilium

# CIS Profile (선택)
profile: cis-1.23

# Add-on 비활성화 (선택)
# disable:
# - rke2-ingress-nginx
# - rke2-servicelb

# Node 설정
node-label:
  - "node-role=control-plane"
node-taint:
  - "node-role.kubernetes.io/control-plane=true:NoSchedule"
EOF

```
#### 1.4 RKE2 시작

```bash
# systemd 서비스 활성화 및 시작
systemctl enable rke2-server.service
systemctl start rke2-server.service

# 로그 확인
journalctl -u rke2-server -f

# 상태 확인
systemctl status rke2-server.service

```
#### 1.5 kubectl 설정

```bash
# kubeconfig 복사
mkdir -p ~/.kube
cp /etc/rancher/rke2/rke2.yaml ~/.kube/config

# kubectl 심볼릭 링크
ln -s /var/lib/rancher/rke2/bin/kubectl /usr/local/bin/kubectl

# 확인
kubectl get nodes
kubectl get pods -A

```
#### 1.6 Node Token 확인

```bash
# Agent 노드 Join에 필요한 Token
cat /var/lib/rancher/rke2/server/node-token
# 예: K10xxx::server:yyy

# 또는
cat /var/lib/rancher/rke2/server/token

```
### 2. Agent 노드 설치

#### 2.1 RKE2 Agent 설치

```bash
# Agent 타입으로 설치
curl -sfL https://get.rke2.io | INSTALL_RKE2_TYPE="agent" sh -

# 설치 확인
ls -l /usr/local/bin/rke2

```
#### 2.2 설정 파일 작성

```bash
# /etc/rancher/rke2/config.yaml
mkdir -p /etc/rancher/rke2
cat > /etc/rancher/rke2/config.yaml <<EOF
# Server 주소
server: https://192.168.56.11:9345

# Node Token (Server에서 복사)
token: K10xxx::server:yyy

# Node 설정
node-label:
  - "node-role=worker"
EOF

```
#### 2.3 RKE2 Agent 시작

```bash
# systemd 서비스 활성화 및 시작
systemctl enable rke2-agent.service
systemctl start rke2-agent.service

# 로그 확인
journalctl -u rke2-agent -f

# 상태 확인
systemctl status rke2-agent.service

```
#### 2.4 노드 확인 (Server에서)

```bash
kubectl get nodes
# NAME STATUS ROLES AGE VERSION
# rke2-server1 Ready control-plane,etcd,master 10m v1.28.x+rke2r1
# rke2-agent1 Ready <none> 2m v1.28.x+rke2r1

```
### 3. 설정 파일 구조

#### 3.1 주요 설정 옵션

```yaml
# /etc/rancher/rke2/config.yaml

# === Server 전용 옵션 ===
# 클러스터 초기화 (첫 번째 Server만)
cluster-init: true

# 추가 Server가 Join할 주소 (두 번째 Server부터)
server: https://192.168.56.11:9345

# etcd 스냅샷 (백업)
etcd-snapshot-schedule-cron: "0 */6 * * *"  # 6시간마다
etcd-snapshot-retention: 10  # 10개 유지

# === Server/Agent 공통 옵션 ===
# Node Token
token: K10xxx::server:yyy

# TLS SAN (추가 인증서 주체 대체 이름)
tls-san:
  - "192.168.56.10"  # VIP
  - "rke2.example.com"

# kubeconfig 권한
write-kubeconfig-mode: "0644"

# CNI 선택
cni:
  - cilium

# Node 설정
node-name: "custom-node-name"
node-label:
  - "key=value"
node-taint:
  - "key=value:NoSchedule"

# CIS Profile
profile: cis-1.23

# Kubelet 옵션
kubelet-arg:
  - "max-pods=200"
  - "eviction-hard=memory.available<500Mi"

# Kube-APIServer 옵션
kube-apiserver-arg:
  - "audit-log-path=/var/log/kubernetes/audit.log"
  - "audit-log-maxage=30"

# Add-on 비활성화
disable:
  - rke2-ingress-nginx
  - rke2-metrics-server

```
### 4. CNI 선택 (Cilium)

#### 4.1 Cilium 설정

```yaml
# /etc/rancher/rke2/config.yaml
cni: cilium

```
#### 4.2 Cilium 확인

```bash
# Cilium Pods 확인
kubectl get pods -n kube-system -l k8s-app=cilium

# Cilium CLI 설치
CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)
curl -L --remote-name-all https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-amd64.tar.gz
tar xzvf cilium-linux-amd64.tar.gz
sudo mv cilium /usr/local/bin/

# Cilium 상태 확인
cilium status
cilium connectivity test

```

---

## RKE2 업그레이드

### 1. 수동 업그레이드

#### 1.1 업그레이드 흐름

```mermaid
graph LR
    A[현재 버전<br/>v1.28.5] --> B[Server 1<br/>Upgrade]
    B --> C[Server 2<br/>Upgrade]
    C --> D[Server 3<br/>Upgrade]
    D --> E[Agent 1<br/>Upgrade]
    E --> F[Agent 2<br/>Upgrade]
    F --> G[완료<br/>v1.28.8]

```
#### 1.2 Server 노드 업그레이드

```bash
# 1. 업그레이드할 버전 확인
curl -s https://update.rke2.io/v1-release/channels | jq -r '.data[] | select(.id=="stable") | .latest'

# 2. Server 노드 업그레이드 (한 번에 1개씩!)
# Server 1
systemctl stop rke2-server
curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION=v1.28.8+rke2r1 sh -
systemctl start rke2-server

# 3. 확인
kubectl get nodes
journalctl -u rke2-server -f

# 4. Server 2, 3도 동일하게 순차 업그레이드

```
#### 1.3 Agent 노드 업그레이드

```bash
# Agent 노드 업그레이드 (한 번에 1개씩 또는 Rolling)
systemctl stop rke2-agent
curl -sfL https://get.rke2.io | INSTALL_RKE2_TYPE="agent" INSTALL_RKE2_VERSION=v1.28.8+rke2r1 sh -
systemctl start rke2-agent

# 확인
kubectl get nodes

```
### 2. Automated 업그레이드 (System Upgrade Controller)

#### 2.1 System Upgrade Controller 설치

```bash
# SUC 설치
kubectl apply -f https://github.com/rancher/system-upgrade-controller/releases/latest/download/system-upgrade-controller.yaml

# 확인
kubectl get pods -n system-upgrade

```
#### 2.2 Server 업그레이드 Plan

```yaml
# server-plan.yaml
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: server-plan
  namespace: system-upgrade
spec:
  # 동시 업그레이드 노드 수
  concurrency: 1

  # Server 노드 선택
  nodeSelector:
    matchExpressions:
      - key: node-role.kubernetes.io/control-plane
        operator: Exists

  # RKE2 서비스 이름
  serviceAccountName: system-upgrade

  # Cordon & Drain
  cordon: true
  drain:
    force: true
    skipWaitForDeleteTimeout: 60

  # 업그레이드 대상 버전
  version: v1.28.8+rke2r1

  # 업그레이드 스크립트
  upgrade:
    image: rancher/rke2-upgrade

```
#### 2.3 Agent 업그레이드 Plan

```yaml
# agent-plan.yaml
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: agent-plan
  namespace: system-upgrade
spec:
  concurrency: 2  # 동시 2개

  # Agent 노드 선택
  nodeSelector:
    matchExpressions:
      - key: node-role.kubernetes.io/control-plane
        operator: DoesNotExist

  serviceAccountName: system-upgrade

  # Server 업그레이드 완료 후 실행
  prepare:
    image: rancher/rke2-upgrade
    args: ["prepare", "server-plan"]

  cordon: true
  drain:
    force: true
    skipWaitForDeleteTimeout: 60

  version: v1.28.8+rke2r1

  upgrade:
    image: rancher/rke2-upgrade

```
#### 2.4 업그레이드 실행

```bash
# Plan 적용
kubectl apply -f server-plan.yaml
kubectl apply -f agent-plan.yaml

# 업그레이드 진행 모니터링
kubectl get plans -n system-upgrade
kubectl get jobs -n system-upgrade
kubectl logs -n system-upgrade -l upgrade.cattle.io/plan=server-plan -f

# 노드 상태 확인
kubectl get nodes -w

```
### 3. 업그레이드 순서

```mermaid
graph TB
    START[업그레이드 시작] --> BACKUP[etcd 백업]
    BACKUP --> S1[Server 1 업그레이드]
    S1 --> S1C{Server 1<br/>정상?}
    S1C -->|Yes| S2[Server 2 업그레이드]
    S1C -->|No| ROLLBACK[Rollback]
    S2 --> S2C{Server 2<br/>정상?}
    S2C -->|Yes| S3[Server 3 업그레이드]
    S2C -->|No| ROLLBACK
    S3 --> S3C{Server 3<br/>정상?}
    S3C -->|Yes| AGENT[Agent 업그레이드<br/>동시 1-2개]
    S3C -->|No| ROLLBACK
    AGENT --> VERIFY[검증 및 완료]

```
**업그레이드 Best Practices**:
1. **etcd 백업 필수**
2. **Server 노드 먼저**, 한 번에 1개씩
3. **각 Server 업그레이드 후 정상 동작 확인**
4. **Agent 노드 나중**, 동시 1-2개
5. **Drain & Cordon으로 워크로드 안전하게 이동**

---

## RKE2 인증서 관리

### 1. 인증서 위치

```bash
# 인증서 저장 위치
/var/lib/rancher/rke2/server/tls/

# 주요 인증서
├── server-ca.crt               # Server CA
├── server-ca.key
├── client-ca.crt               # Client CA
├── client-ca.key
├── request-header-ca.crt       # Request Header CA
├── request-header-ca.key
├── serving-kube-apiserver.crt  # API Server 서빙
├── serving-kube-apiserver.key
├── client-kube-apiserver.crt   # API Server 클라이언트
├── client-admin.crt            # Admin 클라이언트
└── ...

```
### 2. 인증서 갱신

#### 2.1 자동 갱신

```bash
# RKE2는 인증서를 자동으로 갱신 (만료 90일 전)
# - rke2-server 재시작 시 자동 체크
# - 만료 임박 시 자동 갱신

# 수동 갱신 트리거 (재시작)
systemctl restart rke2-server

```
#### 2.2 인증서 확인

```bash
# API Server 인증서 만료일 확인
openssl x509 -in /var/lib/rancher/rke2/server/tls/serving-kube-apiserver.crt -noout -enddate
# notAfter=Feb 21 12:00:00 2027 GMT

# 모든 인증서 만료일 확인
for cert in /var/lib/rancher/rke2/server/tls/*.crt; do
  echo "=== $cert ==="
  openssl x509 -in $cert -noout -enddate
done

```
### 3. Custom CA 사용

#### 3.1 기존 CA로 서명된 인증서 사용

```bash
# /etc/rancher/rke2/config.yaml
# (현재 RKE2는 Custom CA 직접 지원 제한적)
# Workaround: cert-manager 사용

# 1. RKE2 설치 전 기존 인증서 배치
mkdir -p /var/lib/rancher/rke2/server/tls/
cp custom-ca.crt /var/lib/rancher/rke2/server/tls/server-ca.crt
cp custom-ca.key /var/lib/rancher/rke2/server/tls/server-ca.key

# 2. RKE2 시작 (기존 CA 사용)
systemctl start rke2-server

```

---

## Cluster API (CAPI) 소개

### 1. Cluster API

**Cluster API (CAPI)** = Kubernetes를 사용하여 Kubernetes 클러스터를 관리하는 프로젝트

| 특징 | 설명 |
|------|------|
| 선언적 API | Kubernetes 리소스로 클러스터 정의 |
| GitOps 친화적 | YAML 기반 Infrastructure as Code |
| 멀티 클라우드 | AWS, Azure, GCP, vSphere, OpenStack 등 지원 |
| 일관된 경험 | 모든 인프라에서 동일한 API 사용 |

### 2. CAPI 주요 개념

#### 2.1 Management Cluster vs Workload Cluster

```mermaid
graph TB
    subgraph "Management Cluster"
        CAPI[Cluster API<br/>Controllers]
        CAPA[Infrastructure Provider<br/>AWS/Azure/etc]
    end

    subgraph "Workload Cluster 1"
        WC1[Kubernetes Cluster]
    end

    subgraph "Workload Cluster 2"
        WC2[Kubernetes Cluster]
    end

    CAPI -->|Create/Manage| WC1
    CAPI -->|Create/Manage| WC2
    CAPA -->|Provision| WC1
    CAPA -->|Provision| WC2

```
- **Management Cluster**: Cluster API 컨트롤러가 실행되는 클러스터
- **Workload Cluster**: 관리 대상 클러스터 (실제 워크로드 실행)

#### 2.2 주요 리소스

| 리소스 | 설명 | 예시 |
|--------|------|------|
| **Cluster** | 클러스터 전체 정의 | 클러스터 이름, 네트워크 CIDR |
| **Machine** | 단일 노드 (VM/인스턴스) | Control Plane 노드, Worker 노드 |
| **MachineDeployment** | 노드 그룹 (ReplicaSet 유사) | 3개의 Worker 노드 |
| **MachineSet** | Machine의 ReplicaSet | Auto-scaling |
| **KubeadmControlPlane** | Control Plane 노드 그룹 | HA Control Plane |
| **InfrastructureTemplate** | 인프라별 설정 | AWS EC2 인스턴스 타입 |

### 3. CAPI 아키텍처

```mermaid
graph TB
    subgraph "User"
        USER[kubectl apply<br/>cluster.yaml]
    end

    subgraph "Management Cluster"
        API[Kube-APIServer]

        subgraph "CAPI Controllers"
            CC[Cluster Controller]
            MC[Machine Controller]
            KCP[KubeadmControlPlane<br/>Controller]
        end

        subgraph "Provider Controllers"
            INFRA[Infrastructure Provider<br/>AWS/Docker/etc]
            BOOT[Bootstrap Provider<br/>Kubeadm]
            CP[Control Plane Provider<br/>Kubeadm]
        end
    end

    subgraph "Infrastructure (AWS/vSphere/etc)"
        VM1[VM 1<br/>Control Plane]
        VM2[VM 2<br/>Worker]
    end

    USER --> API
    API --> CC
    API --> MC
    API --> KCP

    CC --> INFRA
    MC --> INFRA
    KCP --> INFRA
    KCP --> BOOT
    KCP --> CP

    INFRA -->|Provision| VM1
    INFRA -->|Provision| VM2
    BOOT -->|cloud-init| VM1
    BOOT -->|cloud-init| VM2

```
### 4. Provider 종류

#### 4.1 Infrastructure Providers

| Provider | 설명 | 환경 |
|----------|------|------|
| **CAPA** | AWS Provider | AWS EC2 |
| **CAPZ** | Azure Provider | Azure VM |
| **CAPG** | GCP Provider | GCP GCE |
| **CAPV** | vSphere Provider | VMware vSphere |
| **CAPO** | OpenStack Provider | OpenStack |
| **CAPD** | Docker Provider | Docker 컨테이너 (개발/테스트) |

#### 4.2 Bootstrap Providers

| Provider | 설명 |
|----------|------|
| Kubeadm | kubeadm을 사용한 클러스터 부트스트랩 (기본) |
| Talos | Talos Linux 사용 |

#### 4.3 Control Plane Providers

| Provider | 설명 |
|----------|------|
| Kubeadm | kubeadm 기반 Control Plane 관리 (기본) |
| Kamaji | 멀티 테넌트 Control Plane |
| K3s | K3s Control Plane |
| RKE2 | RKE2 Control Plane |

---

## Cluster API 실습

### 1. Management Cluster 구성

#### 1.1 Kind로 Management Cluster 생성

```bash
# Kind 설치
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Management Cluster 생성
kind create cluster --name capi-mgmt

# 확인
kubectl cluster-info
kubectl get nodes

```
### 2. clusterctl 설치

```bash
# clusterctl 설치
curl -L https://github.com/kubernetes-sigs/cluster-api/releases/download/v1.6.0/clusterctl-linux-amd64 -o clusterctl
chmod +x ./clusterctl
sudo mv ./clusterctl /usr/local/bin/clusterctl

# 확인
clusterctl version
# clusterctl version: &version.Info{Major:"1", Minor:"6", GitVersion:"v1.6.0"}

```
### 3. Provider 초기화

#### 3.1 Docker Provider 초기화 (로컬 테스트용)

```bash
# Docker Provider 초기화
clusterctl init --infrastructure docker

# 설치된 Provider 확인
clusterctl config provider
kubectl get pods -n capi-system
kubectl get pods -n capi-kubeadm-bootstrap-system
kubectl get pods -n capi-kubeadm-control-plane-system
kubectl get pods -n capd-system

```
#### 3.2 AWS Provider 초기화 (프로덕션 예시)

```bash
# AWS 자격증명 설정
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=yyy
export AWS_B64ENCODED_CREDENTIALS=$(clusterawsadm bootstrap credentials encode-as-profile)

# AWS Provider 초기화
clusterctl init --infrastructure aws

# 확인
kubectl get pods -n capa-system

```
### 4. Workload Cluster 생성

#### 4.1 클러스터 템플릿 생성 (Docker Provider)

```bash
# 클러스터 YAML 생성
export CLUSTER_NAME="capi-quickstart"
export KUBERNETES_VERSION="v1.28.0"

clusterctl generate cluster ${CLUSTER_NAME} \
  --kubernetes-version ${KUBERNETES_VERSION} \
  --control-plane-machine-count=1 \
  --worker-machine-count=2 \
  > capi-quickstart.yaml

```
#### 4.2 생성된 YAML 확인

```yaml
# capi-quickstart.yaml (간략화)
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: capi-quickstart
spec:
  clusterNetwork:
    pods:
      cidrBlocks: ["192.168.0.0/16"]
    services:
      cidrBlocks: ["10.96.0.0/12"]
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: KubeadmControlPlane
    name: capi-quickstart-control-plane
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster
    name: capi-quickstart
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerCluster
metadata:
  name: capi-quickstart
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: KubeadmControlPlane
metadata:
  name: capi-quickstart-control-plane
spec:
  replicas: 1
  version: v1.28.0
  machineTemplate:
    infrastructureRef:
      apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
      kind: DockerMachineTemplate
      name: capi-quickstart-control-plane
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: capi-quickstart-md-0
spec:
  clusterName: capi-quickstart
  replicas: 2
  selector:
    matchLabels: null
  template:
    spec:
      bootstrap:
        configRef:
          apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
          kind: KubeadmConfigTemplate
          name: capi-quickstart-md-0
      clusterName: capi-quickstart
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
        kind: DockerMachineTemplate
        name: capi-quickstart-md-0
      version: v1.28.0

```
#### 4.3 Workload Cluster 생성

```bash
# 클러스터 생성
kubectl apply -f capi-quickstart.yaml

# 생성 진행 모니터링
clusterctl describe cluster capi-quickstart
kubectl get cluster
kubectl get kubeadmcontrolplane
kubectl get machinedeployment
kubectl get machines

# 상세 로그
kubectl get events --sort-by='.lastTimestamp' -A

```
#### 4.4 Workload Cluster 접속

```bash
# Workload Cluster kubeconfig 가져오기
clusterctl get kubeconfig capi-quickstart > capi-quickstart.kubeconfig

# CNI 설치 (Calico)
kubectl --kubeconfig=./capi-quickstart.kubeconfig \
  apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/calico.yaml

# Workload Cluster 노드 확인
kubectl --kubeconfig=./capi-quickstart.kubeconfig get nodes
# NAME STATUS ROLES AGE VERSION
# capi-quickstart-control-plane-xxxxx Ready control-plane 5m v1.28.0
# capi-quickstart-md-0-xxxxx-yyyyy Ready <none> 3m v1.28.0
# capi-quickstart-md-0-xxxxx-zzzzz Ready <none> 3m v1.28.0

```
### 5. Cluster 관리

#### 5.1 Worker 노드 스케일링

```bash
# MachineDeployment 스케일
kubectl scale machinedeployment capi-quickstart-md-0 --replicas=5

# 확인
kubectl get machines
clusterctl describe cluster capi-quickstart

```
#### 5.2 Control Plane 스케일링 (HA)

```bash
# KubeadmControlPlane 스케일
kubectl patch kubeadmcontrolplane capi-quickstart-control-plane \
  --type merge -p '{"spec":{"replicas":3}}'

# 확인
kubectl get kubeadmcontrolplane
kubectl get machines -l cluster.x-k8s.io/control-plane

```
#### 5.3 Kubernetes 버전 업그레이드

```bash
# Control Plane 업그레이드
kubectl patch kubeadmcontrolplane capi-quickstart-control-plane \
  --type merge -p '{"spec":{"version":"v1.29.0"}}'

# Worker 업그레이드
kubectl patch machinedeployment capi-quickstart-md-0 \
  --type merge -p '{"spec":{"template":{"spec":{"version":"v1.29.0"}}}}'

# 진행 상황 모니터링
kubectl get machines -w
clusterctl describe cluster capi-quickstart

```
#### 5.4 Cluster 삭제

```bash
# Workload Cluster 삭제
kubectl delete cluster capi-quickstart

# 확인 (모든 리소스 자동 삭제)
kubectl get machines
kubectl get cluster

```

---

## 핵심 개념 정리

### 1. RKE2의 보안 강화 포인트

#### 1.1 FIPS 140-2 준수

```mermaid
graph LR
    A[FIPS 140-2<br/>요구사항] --> B[승인된<br/>암호화 모듈]
    B --> C[TLS 1.2+]
    B --> D[AES-256]
    B --> E[RSA 2048+]
    C --> F[RKE2<br/>인증된 바이너리]
    D --> F
    E --> F

```
**준수 항목**:

| 항목 | 설명 |
|------|------|
| NIST 승인 알고리즘 | 승인된 암호화 알고리즘만 사용 |
| FIPS 140-2 라이브러리 | BoringCrypto 인증 암호화 라이브러리 |
| TLS 1.2+ 강제 | TLS 1.2 이상만 허용 |
| 안전하지 않은 암호화 비활성화 | 취약한 알고리즘 차단 |

#### 1.2 CIS Benchmark 기본 준수

```yaml
# profile: cis-1.23 적용 시 자동 설정

# 1. Pod Security
PodSecurityStandard: restricted

# 2. RBAC
# - 최소 권한 원칙
# - system:masters 그룹 제한

# 3. Network Policies
# - 기본 Deny
# - 명시적 Allow만 허용

# 4. Audit Logging
# - API 요청 모두 기록
# - 민감 정보 마스킹

# 5. Kubelet 강화
# - Anonymous auth 비활성화
# - Authorization mode: Webhook
# - Read-only port 비활성화

```
#### 1.3 SELinux/AppArmor 통합

```bash
# RKE2는 자동으로 보안 프로필 적용
# - Container별 격리
# - Host 파일시스템 접근 제한
# - Capabilities 최소화

```
### 2. Cluster API의 장점

#### 2.1 선언적 인프라 관리

```yaml
# 기존 방식 (명령형)
# 1. terraform apply (인프라 생성)
# 2. ansible-playbook (K8s 설치)
# 3. kubectl apply (워크로드 배포)

# CAPI 방식 (선언적)
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: prod-cluster
spec:
  # 모든 것이 하나의 YAML로!

```
**장점**:

| 장점 | 설명 |
|------|------|
| GitOps 친화적 | Git = Single Source of Truth |
| 재현 가능 | 동일한 YAML = 동일한 클러스터 |
| 버전 관리 | Git History |
| 자동화 | CI/CD 통합 |

#### 2.2 멀티 클라우드 일관성

```mermaid
graph TB
    subgraph "동일한 CAPI YAML"
        YAML[cluster.yaml]
    end

    YAML -->|Provider: AWS| AWS[AWS EKS]
    YAML -->|Provider: Azure| AZURE[Azure AKS]
    YAML -->|Provider: GCP| GCP[GCP GKE]
    YAML -->|Provider: vSphere| VSPHERE[vSphere]

```
**장점**:

| 장점 | 설명 |
|------|------|
| 동일한 API | 모든 클라우드를 하나의 API로 관리 |
| 멀티 클라우드 전략 | 클라우드 간 이동 용이 |
| Vendor Lock-in 회피 | 특정 클라우드 종속성 제거 |

#### 2.3 Self-Healing

```yaml
# MachineHealthCheck로 자동 복구
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineHealthCheck
metadata:
  name: worker-health-check
spec:
  clusterName: capi-quickstart
  maxUnhealthy: 40%
  nodeStartupTimeout: 10m
  unhealthyConditions:
    - type: Ready
      status: Unknown
      timeout: 5m
    - type: Ready
      status: "False"
      timeout: 5m

```
**자동 복구**:

| 기능 | 설명 |
|------|------|
| Unhealthy 노드 감지 | 자동으로 비정상 노드 탐지 |
| 새 노드 교체 | 자동으로 새 노드 생성 및 교체 |
| Workload 재스케줄링 | 자동으로 워크로드 이동 |

### 3. RKE2 vs K3s vs kubeadm

| 특징 | RKE2 | K3s | kubeadm |
|------|------|-----|---------|
| **대상 환경** | Enterprise, 정부 | Edge, IoT, Dev | 커스터마이징 필요 시 |
| **보안 준수** | FIPS, CIS 기본 | 선택적 | 수동 설정 |
| **바이너리 크기** | ~200MB | ~50MB | 분산 다운로드 |
| **Container Runtime** | containerd (내장) | containerd (내장) | 별도 설치 |
| **설치 복잡도** | 매우 쉬움 | 매우 쉬움 | 중간 |
| **HA 구성** | Embedded etcd | Embedded etcd | 외부 etcd 필요 |
| **Add-on** | 풍부 (Ingress, LB) | 기본 (Traefik, LB) | 없음 (수동) |
| **리소스 사용** | 중간 | 낮음 | 중간 |
| **업그레이드** | 쉬움 (SUC) | 쉬움 | 수동 |

**선택 가이드**:

| 도구 | 적합한 환경 |
|------|-----------|
| RKE2 | 보안 준수, 프로덕션, Enterprise |
| K3s | Edge, 리소스 제약, 빠른 배포 |
| kubeadm | 완전한 제어, 커스터마이징, 학습 |

---

**작성일**: 2026-02-21
**학습 주제**: RKE2 & Cluster API
**실습 환경**: VirtualBox, Ubuntu 22.04, RKE2 v1.28.x, Cluster API v1.6.x
