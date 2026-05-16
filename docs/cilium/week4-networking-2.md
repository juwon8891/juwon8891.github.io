---
tags:
  - Cilium
  - Networking
---

# Networking - 노드 파드 간 통신 2 & K8S 외부 노출

> Cilium의 NodePort, LoadBalancer, Ingress 구성과 K8s 외부 노출 방식을 정리한다.

## 실습 환경 구성 및 아키텍처

### 확장된 실습 환경 구성

#### 1.1 실습 환경 개요

![](https://velog.velcdn.com/images/juwon8891/post/def8f4e4-c48d-4e01-b7bc-4c0d46368797/image.png)

4주차 실습 환경은 더욱 복잡한 네트워킹 시나리오를 다루기 위해 4노드 환경으로 확장되었다:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   k8s-ctr       │    │    k8s-w1       │    │    k8s-w0       │    │     router      │
│ (Control Plane) │    │ (Worker Node 1) │    │ (Worker Node 2) │    │  (외부 서버)     │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ eth0: NAT       │    │ eth0: NAT       │    │ eth0: NAT       │    │ eth0: NAT       │
│ eth1:192.168.10.│    │ eth1:192.168.10.│    │ eth1:192.168.20.│    │ eth1:192.168.10.│
│      100        │    │      101        │    │      100        │    │      200        │
│                 │    │                 │    │                 │    │ eth2:192.168.20.│
│ PodCIDR:        │    │ PodCIDR:        │    │ PodCIDR:        │    │      200        │
│ 172.20.0.0/24   │    │ 172.20.1.0/24   │    │ 172.20.2.0/24   │    │                 │
│                 │    │                 │    │                 │    │ loop1: 10.10.1. │
│                 │    │                 │    │                 │    │        200/24   │
│                 │    │                 │    │                 │    │ loop2: 10.10.2. │
│                 │    │                 │    │                 │    │        200/24   │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │                       │
         └───────────────────────┼───────────────────────┤                       │
                    Host-Only Network                     │                       │
                    (192.168.10.0/24)                    │                       │
                                                          │                       │
                                            Host-Only Network                     │
                                            (192.168.20.0/24)                    │
                                                          │                       │
                                                          └───────────────────────┘
                                                                  │
                                                      ┌─────────────────┐
                                                      │ 사내망 시뮬레이션  │
                                                      │ 10.10.0.0/16    │
                                                      └─────────────────┘
```

- **k8s-ctr**: Control Plane 노드 (192.168.10.100)
- **k8s-w1**: Worker 노드 1 (192.168.10.101)
- **k8s-w0**: Worker 노드 2 (192.168.20.100) - 다른 네트워크 대역
- **router**: 외부 서버 (192.168.10.200, 192.168.20.200) - 두 네트워크 대역을 연결하는 라우터 역할, loop1/loop2 인터페이스를 통한 사내망 시뮬레이션

#### 1.2 실습 환경 배포 및 확인

**Vagrant를 통한 자동 배포:**

```bash
# 실습 환경 배포
vagrant up

# 네트워크 인터페이스 정보 확인
# router 서버 네트워크 확인
sshpass -p 'vagrant' ssh vagrant@router ip -br -c -4 addr
# Expected output:
# lo       UNKNOWN  127.0.0.1/8
# eth0     UP       10.0.2.15/24 metric 100 
# eth1     UP       192.168.10.200/24 
# eth2     UP       192.168.20.200/24 
# loop1    UNKNOWN  10.10.1.200/24
# loop2    UNKNOWN  10.10.2.200/24

# k8s 노드들 네트워크 확인
ip -c -4 addr show dev eth1                                # k8s-ctr
sshpass -p 'vagrant' ssh vagrant@k8s-w1 ip -c -4 addr show dev eth1    # k8s-w1
sshpass -p 'vagrant' ssh vagrant@k8s-w0 ip -c -4 addr show dev eth1    # k8s-w0

# 라우팅 정보 확인
ip -c route | grep static
sshpass -p 'vagrant' ssh vagrant@router ip -c route
```

**네트워크 연결성 테스트:**

```bash
# 기본 통신 확인
ping -c 1 10.10.1.200     # router loop1
ping -c 1 192.168.20.100  # k8s-w0 eth1

# 경로 추적 (Path MTU Discovery)
tracepath -n 192.168.20.100
# Expected output:
# 1?: [LOCALHOST] pmtu 1500
# 1:  192.168.10.200  1.222ms 
# 1:  192.168.10.200  0.980ms 
# 2:  192.168.20.100  1.620ms reached
# Resume: pmtu 1500 hops 2 back 2
```

#### 1.3 Cilium v1.18 설치 상태

**기본 설정 확인:**

```bash
# Cilium 버전 및 상태 확인
cilium version
cilium status

# 현재 설정된 라우팅 모드 확인
cilium config view | grep routing-mode
cilium config view | grep auto-direct-node-routes
# Expected: routing-mode: native, auto-direct-node-routes: true
```

## Native Routing Mode 심화 분석

### Native Routing의 특징 및 동작 원리

#### 1.1 autoDirectNodeRoutes 동작 이해

**Native Routing 모드의 핵심 설정:**
- `--set routingMode=native`
- `--set autoDirectNodeRoutes=true`

이 설정은 Cilium이 각 노드의 PodCIDR에 대한 직접 경로를 자동으로 생성하도록 한다.

```bash
# 현재 라우팅 테이블 확인
ip -c route

# 각 노드별 PodCIDR 확인
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'
# Expected output:
# k8s-ctr   172.20.0.0/24
# k8s-w1    172.20.1.0/24  
# k8s-w0    172.20.2.0/24

# Worker 노드들의 라우팅 테이블 확인
sshpass -p 'vagrant' ssh vagrant@k8s-w1 ip -c route
sshpass -p 'vagrant' ssh vagrant@k8s-w0 ip -c route
```

#### 1.2 샘플 애플리케이션 배포 및 라우팅 분석

**애플리케이션 배포:**

```bash
# 3개 노드에 분산 배포될 webpod 애플리케이션 생성
cat << EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webpod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: webpod
  template:
    metadata:
      labels:
        app: webpod
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values:
                - webpod
            topologyKey: "kubernetes.io/hostname"
      containers:
      - name: webpod
        image: traefik/whoami
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: webpod
  labels:
    app: webpod
spec:
  selector:
    app: webpod
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: ClusterIP
EOF

# 테스트 클라이언트 Pod 배포
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: curl-pod
  labels:
    app: curl
spec:
  nodeName: k8s-ctr
  containers:
  - name: curl
    image: nicolaka/netshoot
    command: ["tail"]
    args: ["-f", "/dev/null"]
    terminationGracePeriodSeconds: 0
EOF
```

#### 1.3 Cilium 로드밸런싱 및 서비스 분석

**배포 상태 확인:**

```bash
# 배포 확인
kubectl get deploy,svc,ep webpod -owide
kubectl get endpointslices -l app=webpod
kubectl get ciliumendpoints

# Cilium 서비스 목록 확인
kubectl exec -n kube-system ds/cilium -- cilium-dbg service list

# eBPF 로드밸런서 맵 확인
kubectl exec -n kube-system ds/cilium -- cilium-dbg bpf lb list
kubectl exec -n kube-system ds/cilium -- cilium-dbg bpf lb list | grep 10.96.32.212

# NAT 테이블 확인
kubectl exec -n kube-system ds/cilium -- cilium-dbg bpf nat list
```

**eBPF 맵 상세 분석:**

```bash
# eBPF 맵 목록 (빈 엔트리 제외)
kubectl exec -n kube-system ds/cilium -- cilium-dbg map list | grep -v '0 0'

# 주요 eBPF 맵들:
# - cilium_lb4_services_v2: 서비스 정의
# - cilium_lb4_backends_v3: 백엔드 Pod 정보  
# - cilium_lb4_reverse_nat: 역방향 NAT
# - cilium_ipcache_v2: IP 캐시

# 서비스 맵 상세 정보
kubectl exec -n kube-system ds/cilium -- cilium-dbg map get cilium_lb4_services_v2 | grep 10.96.32.212

# 백엔드 맵 정보
kubectl exec -n kube-system ds/cilium -- cilium-dbg map get cilium_lb4_backends_v3

# IP 캐시 맵 정보
kubectl exec -n kube-system ds/cilium -- cilium-dbg map get cilium_ipcache_v2
```

#### 1.4 k8s-w0 통신 문제 및 분석

**문제 상황:**
k8s-w0 노드는 다른 네트워크 대역(192.168.20.0/24)에 위치하여 직접 통신이 불가능한다.

```bash
# 기본 통신 테스트
kubectl exec -it curl-pod -- curl webpod | grep Hostname

# k8s-w0 노드의 Pod IP 확인
export WEBPOD=$(kubectl get pod -l app=webpod --field-selector spec.nodeName=k8s-w0 -o jsonpath='{.items[0].status.podIP}')
echo $WEBPOD

# 직접 통신 시도 (실패 예상)
kubectl exec -it curl-pod -- ping -c 2 -w 1 -W 1 $WEBPOD
```

**패킷 추적 분석:**

```bash
# router에서 ICMP 패킷 모니터링
# (router 서버에서 실행)
tcpdump -i any icmp -nn

# 예상 결과: k8s-ctr → router → 라우팅 실패
# 22:08:20.123415 eth1 In  IP 172.20.0.89 > 172.20.2.36: ICMP echo request
# 22:08:20.123495 eth0 Out IP 172.20.0.89 > 172.20.2.36: ICMP echo request

# router의 라우팅 테이블 확인
ip route get 172.20.2.36
# Expected: 172.20.2.36 via 10.0.2.2 dev eth0 src 10.0.2.15 uid 0
```

**해결 방안:**

| 방안 | 설명 |
|------|------|
| 방안 1 | BGP를 통한 동적 라우팅 (5주차에서 다룸) |
| 방안 2 | Overlay Network (Encapsulation) 사용 |
| 방안 3 | Static Route 수동 설정 (임시 해결책) |

## Overlay Network (Encapsulation) Mode

### VXLAN Encapsulation 개념

#### 1.1 VXLAN 터널링 원리

![](https://velog.velcdn.com/images/juwon8891/post/55b75fd4-86d8-4100-adcb-b5eae0a557a6/image.png)

VXLAN(Virtual eXtensible Local Area Network)은 UDP 기반의 오버레이 터널링 프로토콜이다:

**VXLAN 헤더 구조:**

| 헤더 | 크기 |
|------|------|
| 외부 이더넷 헤더 | 14 bytes |
| 외부 IP 헤더 | 20 bytes |
| 외부 UDP 헤더 | 8 bytes |
| VXLAN 헤더 | 8 bytes |
| 내부 이더넷 헤더 | 14 bytes |
| 총 오버헤드 | 50 bytes |

**VXLAN vs GENEVE 비교:**

| 특징 | VXLAN | GENEVE |
|------|-------|--------|
| 헤더 크기 | 8 bytes (고정) | 8+ bytes (가변) |
| 메타데이터 | 제한적 | 확장 가능 |
| 성능 | 높음 | 보통 |
| 확장성 | 제한적 | 우수 |
| 사용 사례 | 일반적인 오버레이 | OpenStack, 복잡한 메타데이터 |

### Calico와의 라우팅 모드 비교

![](https://velog.velcdn.com/images/juwon8891/post/aa272e69-6d1b-47e5-9ab9-30e3050a224d/image.png)

**Calico Direct 모드:**
```
Pod A (Node 1) → Node1 Route Table → Physical Network → Node2 Route Table → Pod B (Node 2)
```
- 캡슐화 없음
- 높은 성능
- 네트워크 인프라 의존성
- BGP 필수

**Calico IPIP 모드:**
```
Pod A → Node1 IPIP → Internet Protocol in IP → Node2 IPIP → Pod B
```
- IP-in-IP 캡슐화 (20 bytes 오버헤드)
- 네트워크 제약 극복
- VXLAN 대비 낮은 오버헤드

**Cilium vs Calico 라우팅 비교:**

| 특징 | Cilium Native | Cilium VXLAN | Calico Direct | Calico IPIP |
|------|---------------|--------------|---------------|-------------|
| 오버헤드 | 없음 | 50 bytes | 없음 | 20 bytes |
| 네트워크 요구사항 | 높음 | 낮음 | 높음 | 낮음 |
| 성능 | 최고 | 보통 | 최고 | 높음 |
| eBPF 활용 | 완전 | 완전 | 제한적 | 제한적 |
| L7 정책 | 지원 | 지원 | 제한적 | 제한적 |

#### 1.2 VXLAN 모드로 전환

**커널 모듈 확인:**

```bash
# VXLAN/GENEVE 커널 지원 확인
grep -E 'CONFIG_VXLAN=y|CONFIG_VXLAN=m|CONFIG_GENEVE=y|CONFIG_GENEVE=m|CONFIG_FIB_RULES=y' /boot/config-$(uname -r)
# Expected output:
# CONFIG_FIB_RULES=y      # 커널에 내장됨
# CONFIG_VXLAN=m          # 모듈로 컴파일됨 → 커널에 로드해서 사용
# CONFIG_GENEVE=m         # 모듈로 컴파일됨 → 커널에 로드해서 사용

# 커널 모듈 로드
lsmod | grep -E 'vxlan|geneve'
modprobe vxlan
lsmod | grep -E 'vxlan|geneve'

# Worker 노드들에도 VXLAN 모듈 로드
for i in w1 w0 ; do 
  echo ">> node : k8s-$i <<"
  sshpass -p 'vagrant' ssh vagrant@k8s-$i sudo modprobe vxlan
  echo
done
```

**Cilium VXLAN 모드 업그레이드:**

```bash
# 기존 통신 상태 유지 (백그라운드)
kubectl exec -it curl-pod -- ping $WEBPOD1 &

# VXLAN 터널 모드로 업그레이드
helm upgrade cilium cilium/cilium \
  --namespace kube-system \
  --version 1.18.0 \
  --reuse-values \
  --set routingMode=tunnel \
  --set tunnelProtocol=vxlan \
  --set autoDirectNodeRoutes=false \
  --set installNoConntrackIptablesRules=false

# Cilium 재시작
kubectl rollout restart -n kube-system ds/cilium
```

#### 1.3 VXLAN 설정 확인

**VXLAN 인터페이스 및 설정 확인:**

```bash
# Cilium 기능 상태 확인
cilium features status
cilium features status | grep datapath_network

# 라우팅 모드 확인
kubectl exec -it -n kube-system ds/cilium -- cilium status | grep ^Routing
cilium config view | grep tunnel

# VXLAN 인터페이스 확인
ip -c addr show dev cilium_vxlan

# 모든 노드의 VXLAN 인터페이스 확인
for i in w1 w0 ; do 
  echo ">> node : k8s-$i <<"
  sshpass -p 'vagrant' ssh vagrant@k8s-$i ip -c addr show dev cilium_vxlan
  echo
done
```

#### 1.4 VXLAN 라우팅 분석

**라우팅 테이블 변화:**

```bash
# Control Plane 노드 라우팅
ip -c route | grep cilium_host

# Expected routes:
# 172.20.0.238 dev cilium_host proto kernel scope link
# 172.20.0.0/24 via 172.20.0.238 dev cilium_host proto kernel src 172.20.0.238
# 172.20.1.0/24 via 172.20.0.238 dev cilium_host proto kernel src 172.20.0.238 mtu 1450
# 172.20.2.0/24 via 172.20.0.238 dev cilium_host proto kernel src 172.20.0.238 mtu 1450

# 경로 확인
ip route get 172.20.1.10  # k8s-w1 Pod
ip route get 172.20.2.10  # k8s-w0 Pod

# Worker 노드들 라우팅 확인
for i in w1 w0 ; do 
  echo ">> node : k8s-$i <<"
  sshpass -p 'vagrant' ssh vagrant@k8s-$i ip -c route | grep cilium_host
  echo
done
```

### VXLAN 통신 분석

#### 2.1 eBPF 터널 엔드포인트 확인

**각 노드의 Cilium Pod 이름 확인:**

```bash
# 노드별 Cilium Pod 이름 지정
export CILIUMPOD0=$(kubectl get -l k8s-app=cilium pods -n kube-system --field-selector spec.nodeName=k8s-ctr -o jsonpath='{.items[0].metadata.name}')
export CILIUMPOD1=$(kubectl get -l k8s-app=cilium pods -n kube-system --field-selector spec.nodeName=k8s-w1 -o jsonpath='{.items[0].metadata.name}')
export CILIUMPOD2=$(kubectl get -l k8s-app=cilium pods -n kube-system --field-selector spec.nodeName=k8s-w0 -o jsonpath='{.items[0].metadata.name}')

echo $CILIUMPOD0 $CILIUMPOD1 $CILIUMPOD2

# 각 노드의 router IP 확인
kubectl exec -it $CILIUMPOD0 -n kube-system -c cilium-agent -- cilium status --all-addresses | grep router
kubectl exec -it $CILIUMPOD1 -n kube-system -c cilium-agent -- cilium status --all-addresses | grep router  
kubectl exec -it $CILIUMPOD2 -n kube-system -c cilium-agent -- cilium status --all-addresses | grep router
```

**eBPF 맵 상태 확인:**

```bash
# IP 캐시 맵 (노드별 터널 엔드포인트 정보)
kubectl exec -n kube-system $CILIUMPOD0 -- cilium-dbg bpf ipcache list
kubectl exec -n kube-system $CILIUMPOD1 -- cilium-dbg bpf ipcache list
kubectl exec -n kube-system $CILIUMPOD2 -- cilium-dbg bpf ipcache list

# Socket NAT 맵 (터널링 관련)
kubectl exec -n kube-system $CILIUMPOD0 -- cilium-dbg bpf socknat list
kubectl exec -n kube-system $CILIUMPOD1 -- cilium-dbg bpf socknat list
kubectl exec -n kube-system $CILIUMPOD2 -- cilium-dbg bpf socknat list
```

#### 2.2 VXLAN 패킷 분석

**패킷 캡처 및 분석:**

```bash
# k8s-w0 노드의 Pod IP 확인
export WEBPOD=$(kubectl get pod -l app=webpod --field-selector spec.nodeName=k8s-w0 -o jsonpath='{.items[0].status.podIP}')
echo $WEBPOD

# 터미널 1: router에서 VXLAN 패킷 모니터링
tcpdump -i any udp port 8472 -nn

# 터미널 2: ICMP 테스트
kubectl exec -it curl-pod -- ping -c 2 -w 1 -W 1 $WEBPOD

# 패킷 분석 예시:
# 08:49:29.969241 eth1 In  IP 192.168.10.100.54386 > 192.168.20.100.8472: 
#   OTV, flags I 0x08, overlay 0, instance 23926 
#   IP 172.20.0.44 > 172.20.2.43: ICMP echo request
```

**VXLAN 트래픽 상세 분석:**

```bash
# 터미널 1: 패킷을 파일로 저장
tcpdump -i any udp port 8472 -w /tmp/vxlan.pcap

# 터미널 2: HTTP 트래픽 생성
kubectl exec -it curl-pod -- sh -c 'while true; do curl -s --connect-timeout 1 webpod | grep Hostname; echo "---" ; sleep 1; done'

# 패킷 분석 도구 사용
tshark -r /tmp/vxlan.pcap -d udp.port==8472,vxlan
termshark -r /tmp/vxlan.pcap
termshark -r /tmp/vxlan.pcap -d udp.port==8472,vxlan
```

#### 2.3 Hubble을 통한 오버레이 트래픽 모니터링

```bash
# Hubble 플로우 모니터링
hubble observe -f --protocol tcp --pod curl-pod

# VXLAN 모드에서의 플로우 로그 예시:
# Aug 3 00:02:26.403: default/curl-pod:40332 ID:23926 -> default/webpod-697b545f57-76lt6:80 ID:12438 to-overlay FORWARDED TCP Flags: SYN
# Aug 3 00:02:26.405: default/curl-pod:40332 ID:23926 <- default/webpod-697b545f57-76lt6:80 ID:12438 to-endpoint FORWARDED TCP Flags: SYN, ACK
# Aug 3 00:02:26.405: default/curl-pod:40332 ID:23926 -> default/webpod-697b545f57-76lt6:80 ID:12438 to-overlay FORWARDED TCP Flags: ACK

# 주요 상태 설명:
# - to-overlay: 패킷이 오버레이 네트워크로 전송됨
# - to-endpoint: 패킷이 대상 엔드포인트로 전달됨
```

### MTU 고려사항

#### 3.1 VXLAN MTU 문제

**MTU 제한 확인:**

```bash
# VXLAN 인터페이스 MTU 확인
ip -c addr show dev cilium_vxlan
# Expected: mtu 1450 (1500 - 50 bytes VXLAN overhead)

# MTU 테스트
kubectl exec -it curl-pod -- ping -M do -s 1500 $WEBPOD
# Expected error: ping: sendmsg: Message too long

# 적절한 크기로 테스트 (1450 - 28 = 1422 bytes payload)
kubectl exec -it curl-pod -- ping -M do -s 1422 $WEBPOD
```

- **Don't Fragment (DF) 플래그**: `-M do` 옵션으로 설정하여 조각화 방지
- **Payload 크기**: `-s` 옵션으로 ICMP 데이터 크기 지정
- **VXLAN 오버헤드**: 50 bytes 추가로 유효 MTU 감소 (1500 → 1450)

## Kubernetes Service 심화

### Service 타입별 특징 및 발전 단계

#### 1.1 Service 발전 과정

- ClusterIP 타입

![](https://velog.velcdn.com/images/juwon8891/post/22023948-c4a6-4407-837a-a11fbf3ec6bf/image.png)

- NodePort 타입

![](https://velog.velcdn.com/images/juwon8891/post/178e07bb-757b-4a13-9d4e-6f6e08054728/image.png)

- LoadBalancer 타입

![](https://velog.velcdn.com/images/juwon8891/post/5747afe3-55db-4bd6-b100-4561ff786a24/image.png)

| 단계 | 타입 | 설명 |
|------|------|------|
| 1단계 | Pod 생성 | 클러스터 내부에서만 접속 가능. Pod IP는 동적으로 변경됨. 직접 Pod IP로 접근 시 Pod 재시작 시 연결 끊김 |
| 2단계 | ClusterIP | 클러스터 내부에서만 접속 가능. 고정 Virtual IP와 Domain 주소 제공. 다수 Pod에 대한 로드밸런싱. 내부 DNS를 통한 서비스 디스커버리 |
| 3단계 | NodePort | 외부 클라이언트가 노드 IP와 특정 포트를 통해 접속. 모든 노드에서 동일한 포트로 서비스 접근 가능. 포트 범위 제한 (30000-32767). 높은 포트 번호로 인한 사용성 문제 |
| 4단계 | LoadBalancer | 클라우드 제공자의 로드밸런서 활용. 단일 External IP를 통한 서비스 접근. 프라이빗 클라우드에서는 MetalLB나 Cilium L2/BGP 필요. 가장 운영 친화적인 외부 노출 방식 |

**Service 타입별 특성 비교:**

| 특징 | ClusterIP | NodePort | LoadBalancer | ExternalName |
|------|-----------|----------|--------------|--------------|
| 외부 접근 | X | O | O | N/A |
| 로드밸런싱 | O | O | O | X |
| 포트 제한 | X | O | X | N/A |
| 클라우드 의존성 | X | X | O | X |
| 운영 복잡성 | 낮음 | 보통 | 낮음 | 낮음 |

#### 1.2 네트워크 주소 변환 (NAT) 개념

| 용어 | 설명 |
|------|------|
| S.IP | Source IP (출발지 IP) |
| D.IP | Destination IP |
| S.Port | Source Port (출발지 포트) |
| D.Port | Destination Port (도착지 포트) |
| SNAT | Source NAT (출발지 IP 변환) |
| DNAT | Destination NAT |

### kube-proxy 모드 비교

#### 2.1 kube-proxy 역할

kube-proxy는 각 노드에서 실행되는 네트워크 프록시로 Kubernetes Service 개념의 일부를 구현한다:

- **실행 위치**: 각 노드에서 데몬셋으로 실행
- **지원 프로토콜**: UDP, TCP, SCTP
- **주요 기능**: 로드밸런싱, 서비스 엔드포인트 관리
- **제한사항**: HTTP 레벨 처리는 불가능

#### 2.2 프록시 모드별 특징

![](https://velog.velcdn.com/images/juwon8891/post/9cfc97c9-496f-4974-935d-f18d3c975809/image.png)

**kube-proxy 모드별 성능 비교:**

| 특징 | User Space | iptables | IPVS | nftables | eBPF (Cilium) |
|------|------------|----------|------|----------|---------------|
| 성능 | 낮음 | 보통 | 높음 | 높음 | 최고 |
| 확장성 | 나쁨 | 제한적 | 우수 | 우수 | 우수 |
| 커널 의존성 | 낮음 | 보통 | 높음 | 높음 | 높음 |
| 메모리 사용량 | 높음 | 보통 | 낮음 | 낮음 | 낮음 |
| CPU 사용량 | 높음 | 보통 | 낮음 | 낮음 | 낮음 |

#### User Space 프록시 모드 (미사용)
```
클라이언트 → iptables REDIRECT → kube-proxy → Pod
```
- SPOF(Single Point of Failure) 위험
- 사용자 공간과 커널 공간 간 변환 오버헤드
- 현재는 사용하지 않음

#### iptables 프록시 모드
```
클라이언트 → iptables DNAT → Pod (직접)
```
- netfilter 서브시스템의 iptables API 활용
- kube-proxy는 규칙만 관리, 실제 데이터 트래픽은 netfilter가 처리
- 데몬셋으로 동작하여 SPOF 해결
- User Space 모드 대비 안정성과 성능 향상

#### IPVS 프록시 모드
```
클라이언트 → IPVS (kernel space) → Pod
```
- Linux 커널의 L4 로드밸런서인 IPVS 활용
- 해시 테이블 기반으로 iptables보다 높은 성능
- 커널 공간에서 동작하여 낮은 지연시간
- 높은 네트워크 트래픽 처리량 지원

#### nftables 프록시 모드
```
클라이언트 → nftables API → Pod
```
- iptables의 후속 기술, 향상된 성능과 확장성
- 커널 5.13 이상에서 지원
- 서비스 엔드포인트 변경을 더 빠르고 효율적으로 처리
- 아직 상대적으로 새로운 기술

#### eBPF 모드 + XDP
```
클라이언트 → eBPF (XDP) → Pod
```
- 기존 netfilter/iptables 우회
- 최고 성능의 패킷 처리
- XDP(eXpress Data Path)로 커널 바이패스
- Cilium에서 활용하는 고성능 방식

## Service LoadBalancer IP Address Management (LB IPAM)

### LB IPAM 개념 및 필요성

#### 1.1 LB IPAM 소개

LoadBalancer IP Address Management는 LoadBalancer 타입의 서비스에 External IP를 할당할 수 있게 해주는 기능이다:

- **클라우드 제공업체 의존성 해결**: 프라이빗 클라우드 환경에서 LoadBalancer 서비스 지원
- **Cilium 통합**: Cilium BGP Control Plane 및 L2 Announcements와 통합

**동작 방식:**

1. **IP 풀 생성**: CiliumLoadBalancerIPPool CRD로 IP 범위 정의
2. **자동 할당**: LoadBalancer 서비스 생성 시 IP 자동 할당
3. **광고 메커니즘**: BGP 또는 L2 Announcements를 통한 IP 광고

#### 1.2 지원 기능

| 기능 | 설명 |
|------|------|
| Service Selectors | 특정 서비스에만 IP 할당 |
| Pool 비활성화 | 특정 풀 일시 중단 |
| Service 사용 확인 | IP 할당 상태 모니터링 |
| LoadBalancerClass | BGP 또는 L2 방식 지정 |
| IP 직접 요청 | 특정 IP 지정 할당 |
| Sharing Keys | 하나의 IP를 여러 포트로 공유 |

### LB IPAM 실습

#### 2.1 CiliumLoadBalancerIPPool 생성

```bash
# 기존 IP Pool 확인
kubectl get CiliumLoadBalancerIPPool -A

# IP Pool 생성 (충돌하지 않는 대역 사용)
cat << EOF | kubectl apply -f -
apiVersion: "cilium.io/v2"
kind: CiliumLoadBalancerIPPool
metadata:
  name: "cilium-lb-ippool"
spec:
  blocks:
  - start: "192.168.10.211"
    stop: "192.168.10.215"
EOF

# CiliumLoadBalancerIPPool 축약어 확인
kubectl api-resources | grep -i CiliumLoadBalancerIPPool
# 축약어: ippools, ippool, lbippool, lbippools

# IP Pool 상태 확인
kubectl get ippools
# Expected output:
# NAME               DISABLED   CONFLICTING   IPS         AVAILABLE   AGE
# cilium-lb-ippool   false      False         5           5           20s
```

#### 2.2 LoadBalancer 서비스 생성

```bash
# webpod 서비스를 LoadBalancer 타입으로 변경
kubectl patch svc webpod -p '{"spec":{"type":"LoadBalancer"}}'

# 서비스 상태 확인
kubectl get svc webpod
# Expected output:
# NAME     TYPE           CLUSTER-IP     EXTERNAL-IP      PORTS         AGE
# webpod   LoadBalancer   10.96.32.212   192.168.10.211   80:32039/TCP  150m

# External IP 확인
LBIP=$(kubectl get svc webpod -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "LoadBalancer IP: $LBIP"
```

#### 2.3 LoadBalancer IP 통신 테스트

**클러스터 내부에서 테스트:**

```bash
# 클러스터 내부에서 LB IP로 접근
curl -s $LBIP
kubectl exec -it curl-pod -- curl -s $LBIP
kubectl exec -it curl-pod -- curl -s $LBIP | grep Hostname

# 소스 IP 확인 (Pod 관점)
kubectl exec -it curl-pod -- curl -s $LBIP | grep RemoteAddr

# 로드밸런싱 확인
for i in {1..100}; do 
  kubectl exec -it curl-pod -- curl -s $LBIP | grep Hostname
done | sort | uniq -c | sort -nr
```

**IP 할당 상태 확인:**

```bash
# IP Pool 상태 상세 확인
kubectl get ippools
kubectl get ippools -o jsonpath='{.items[*].status.conditions[?(@.type!="cilium.io/PoolConflict")]}' | jq

# 서비스 상태 JSON 확인
kubectl get svc webpod -o json | jq
kubectl get svc webpod -o jsonpath='{.status}' | jq
```

#### 2.4 외부 접근 문제

**클러스터 외부에서 접근 시도:**

```bash
# router에서 LB IP 접근 시도 (실패 예상)
# (router 서버에서 실행)
LBIP=192.168.10.211
curl --connect-timeout 1 $LBIP

# ARP 테이블 확인
arping -i eth1 $LBIP -c 1

# 지속적인 ARP 요청 (응답 없음)
arping -i eth1 $LBIP -c 100000
```

**문제 원인:**
- LoadBalancer IP가 할당되었지만 외부 광고가 없음
- BGP 또는 L2 Announcements가 필요
- 네트워크 인프라가 해당 IP에 대한 경로를 모름

## Cilium L2 Announcements

### L2 Announcements 개념

#### 1.1 MetalLB Layer2 모드 vs Cilium L2 Announcements

![](https://velog.velcdn.com/images/juwon8891/post/732667a5-5bcc-444d-9588-73da1a5de8d6/image.png)

**MetalLB Layer2 모드 동작:**

1. Speaker Pod가 LoadBalancer IP에 대한 ARP 응답
2. 특정 노드에서만 IP 소유권 주장 (리더 선출)
3. MAC 주소 학습을 통한 트래픽 전달
4. 장애 시 다른 노드로 IP 이동

**Cilium L2 Announcements 장점:**

- **MetalLB 대체**: MetalLB를 대체할 수 있는 네이티브 기능
- **eBPF 기반**: 고성능 처리
- **통합성**: Cilium 에코시스템과 완전 통합
- **안정성**: 더 나은 성능과 안정성

#### 1.2 L2 Announcements 활성화

**Cilium L2 Announcements 설정:**

```bash
# L2 Announcements 활성화
helm upgrade cilium cilium/cilium \
  --namespace kube-system \
  --reuse-values \
  --set l2announcements.enabled=true

# 설정 확인
cilium config view | grep l2-announcements
# Expected: l2-announcements-enabled: true

# L2 Announcements 정책 생성
cat << EOF | kubectl apply -f -
apiVersion: "cilium.io/v2alpha1"
kind: CiliumL2AnnouncementPolicy
metadata:
  name: default-l2-announcement-policy
spec:
  serviceSelector:
    matchLabels:
      app: webpod
  nodeSelector:
    matchExpressions:
    - key: node-role.kubernetes.io/control-plane
      operator: DoesNotExist
  interfaces:
  - eth1
  externalIPs: true
  loadBalancerIPs: true
EOF

# 정책 확인
kubectl get CiliumL2AnnouncementPolicy
kubectl describe CiliumL2AnnouncementPolicy default-l2-announcement-policy
```

### L2 Announcements 동작 확인

#### 2.1 ARP 테이블 및 트래픽 확인

```bash
# LoadBalancer IP 재확인
LBIP=$(kubectl get svc webpod -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "LoadBalancer IP: $LBIP"

# k8s 노드들에서 ARP 테이블 확인
ip -c neigh | grep $LBIP
sshpass -p 'vagrant' ssh vagrant@k8s-w1 ip -c neigh | grep $LBIP
sshpass -p 'vagrant' ssh vagrant@k8s-w0 ip -c neigh | grep $LBIP

# router에서 ARP 요청 및 응답 확인
# (router 서버에서 실행)
arping -i eth1 $LBIP -c 3

# ARP 테이블에서 응답 확인
arp -a | grep $LBIP
```

#### 2.2 외부에서 LoadBalancer 서비스 접근

```bash
# router에서 HTTP 접근 (성공 예상)
# (router 서버에서 실행)
curl -s $LBIP
curl -s $LBIP | grep Hostname

# 지속적인 접근 테스트
while true; do 
  curl -s --connect-timeout 1 $LBIP | grep Hostname
  sleep 1
done
```

#### 2.3 L2 Announcements 로그 및 상태 확인

```bash
# Cilium L2 Announcements 관련 로그 확인
kubectl logs -n kube-system -l k8s-app=cilium -c cilium-agent | grep -i l2

# L2 Announcements 상태 확인
cilium status | grep -i l2

# LoadBalancer 서비스에 대한 L2 광고 확인
kubectl exec -n kube-system ds/cilium -c cilium-agent -- cilium service list | grep LoadBalancer
```

### L2 Announcements 트러블슈팅

#### 3.1 일반적인 문제점

**문제 1: ARP 응답 없음**
```bash
# L2 정책 확인
kubectl get CiliumL2AnnouncementPolicy -o yaml

# 노드 셀렉터 확인
kubectl get nodes --show-labels

# 인터페이스 설정 확인
ip -c addr show dev eth1
```

**문제 2: 특정 노드에서만 응답**
```bash
# 리더 선출 상태 확인
kubectl logs -n kube-system -l k8s-app=cilium -c cilium-agent | grep leader

# 모든 노드의 L2 상태 확인
for node in k8s-ctr k8s-w1 k8s-w0; do
  echo "=== Node: $node ==="
  kubectl get pods -n kube-system -l k8s-app=cilium --field-selector spec.nodeName=$node
done
```

#### 3.2 성능 및 모니터링

```bash
# L2 Announcements 메트릭 확인
kubectl exec -n kube-system ds/cilium -c cilium-agent -- curl -s localhost:9962/metrics | grep l2

# 네트워크 인터페이스 통계
ip -s link show dev eth1

# ARP 캐시 만료 시간 확인
cat /proc/sys/net/ipv4/neigh/eth1/base_reachable_time_ms
```


### 모니터링 스택 구성

#### 1.1 주요 구성 요소

| 컴포넌트 | 역할 |
|----------|------|
| Prometheus | 메트릭 수집 및 저장 |
| Grafana | 시각화 및 대시보드 |
| AlertManager | 알림 관리 |
| Node Exporter | 노드 메트릭 수집 |

**Cilium 관련 메트릭:**

| 메트릭 | 포트 |
|--------|------|
| Cilium Agent 메트릭 | 9962 |
| Cilium Operator 메트릭 | 9963 |
| Hubble 메트릭 | 9965 |

#### 1.2 메트릭 수집 확인

```bash
# Cilium Agent 메트릭 확인
kubectl exec -n kube-system ds/cilium -c cilium-agent -- curl -s localhost:9962/metrics | head -20

# Cilium Operator 메트릭 확인  
kubectl exec -n kube-system deploy/cilium-operator -- curl -s localhost:9963/metrics | head -20

# Hubble 메트릭 확인
kubectl exec -n kube-system deploy/hubble-relay -- curl -s localhost:9965/metrics | head -20
```

### 권장 모니터링 지표

#### 2.1 Cilium 핵심 메트릭

**성능 지표:**
```bash
# eBPF 맵 사용률
cilium_datapath_conntrack_gc_entries
cilium_bpf_map_pressure

# 엔드포인트 재생성
cilium_endpoint_regenerations_total

# 패킷 드롭
cilium_drop_count_total
cilium_drop_bytes_total
```

**서비스 지표:**
```bash
# 로드밸런서 백엔드
cilium_services_events_total
cilium_k8s_client_api_calls_total

# L2 Announcements
cilium_l2_announcements_total
```

#### 2.2 L2 Announcements 특화 메트릭

```bash
# L2 광고 성공/실패
kubectl exec -n kube-system ds/cilium -c cilium-agent -- curl -s localhost:9962/metrics | grep l2_announcement
```


### YouTube eCHO Episode 시리즈

| 에피소드 | 내용 |
|----------|------|
| eCHO Episode 1 | Cilium 소개 및 기본 개념 |
| eCHO Episode 7 | DNS with Laurent Bernaille |
| eCHO Episode 39 | Local Redirect Policy |
| eCHO Episode 56 | Service Mesh with Cilium |
| eCHO Episode 72 | BGP on Cilium |

### 공식 문서 및 블로그

| 문서 | 링크 |
|------|------|
| Cilium Service LoadBalancer & IPAM | [docs.cilium.io](https://docs.cilium.io/en/stable/network/lb-ipam/) |
| L2 Announcements Guide | [docs.cilium.io](https://docs.cilium.io/en/stable/network/l2-announcements/) |
| BGP Control Plane | [docs.cilium.io](https://docs.cilium.io/en/stable/network/bgp-control-plane/) |
| MetalLB Migration Guide | [isovalent.com](https://isovalent.com/blog/post/migrating-from-metallb-to-cilium/) |

### 트러블슈팅 가이드

#### 4.1 일반적인 문제점

**Native Routing 문제:**
```bash
# 라우팅 테이블 확인
ip route show table main

# BGP 피어 상태 확인 (BGP 사용 시)
cilium bgp peers

# 노드 간 연결성 확인
ping <other-node-ip>
```

**L2 Announcements 문제:**
```bash
# L2 정책 상태 확인
kubectl get CiliumL2AnnouncementPolicy -o yaml

# ARP 테이블 확인
ip neigh show

# 인터페이스 상태 확인
ip link show
```

#### 4.2 성능 분석

**네트워크 성능 측정:**
```bash
# iperf3를 통한 대역폭 측정
kubectl run iperf3-server --image=networkstatic/iperf3 --port=5201
kubectl run iperf3-client --image=networkstatic/iperf3 --rm -it -- -c <server-ip>

# 지연시간 측정
kubectl exec -it curl-pod -- ping -c 100 <target-ip> | tail -1
```


### 핵심 성취 목표

**네트워킹 모드 이해:**

- **Native Routing vs Overlay**: 두 모드의 차이점 및 적용 시나리오
- **VXLAN/GENEVE 터널링**: UDP 기반 오버레이 캡슐화 메커니즘
- **autoDirectNodeRoutes**: 동일 네트워크 대역 노드 간 직접 경로 자동 생성
- **MTU 고려사항**: VXLAN 50 bytes 오버헤드로 인한 유효 MTU 감소 (1500 → 1450)

**Service 외부 노출:**

- **LoadBalancer IPAM**: CiliumLoadBalancerIPPool로 External IP 풀 관리
- **L2 Announcements**: ARP 기반으로 LoadBalancer IP를 외부에 광고
- **kube-proxy 모드 비교**: User Space → iptables → IPVS → nftables → eBPF 성능 진화
- **운영 고려사항**: 규모별 적합한 외부 노출 방식 선택 기준

