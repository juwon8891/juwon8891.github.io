---
tags:
  - Cilium
  - BGP
  - ClusterMesh
---

# BGP Control Plane & ClusterMesh

> Cilium의 BGP Control Plane 설정과 ClusterMesh를 통한 멀티 클러스터 연동 방법을 정리한다.

## 실습 환경 구성 및 아키텍처

### 1. 확장된 실습 환경 구성

#### 1.1 실습 환경 개요

![](https://velog.velcdn.com/images/juwon8891/post/2e873945-a3c4-4ee1-b3da-726a63eba6ce/image.png)

5주차 실습 환경은 BGP Control Plane과 ClusterMesh를 다루기 위해 FRR 라우터가 포함된 고급 네트워킹 환경으로 구성된다. 이 환경은 실제 데이터센터의 네트워크 구조를 시뮬레이션하며, 멀티 네트워크 세그먼트와 BGP 라우팅을 포함한다.

**환경 구성의 핵심 특징:**

1. **분산 네트워크 설계**:
   - 192.168.10.0/24 (메인 클러스터 네트워크)
   - 192.168.20.0/24 (원격 노드 네트워크)
   - 이중화된 네트워크 구조로 실제 환경과 유사

2. **FRR 기반 BGP 라우팅**:
   - AS 65000을 사용하는 FRR 라우터
   - 사내망 시뮬레이션을 위한 loopback 인터페이스
   - BGP 피어링을 통한 동적 라우팅

3. **실제 데이터센터 시나리오**:
   - 서로 다른 네트워크 세그먼트의 k8s 노드
   - BGP를 통한 PodCIDR 및 Service 광고
   - ECMP를 통한 고가용성 및 로드밸런싱

**핵심 구성 요소:**

- **k8s-ctr**: Control Plane 노드 (192.168.10.100, PodCIDR: 172.20.0.0/24)
- **k8s-w1**: Worker 노드 1 (192.168.10.101, PodCIDR: 172.20.1.0/24)
- **k8s-w0**: Worker 노드 2 (192.168.20.100, PodCIDR: 172.20.2.0/24) - 다른 네트워크 대역
- **router**: FRR BGP 라우터 (AS 65000) - eth1: 192.168.10.200/24, eth2: 192.168.20.200/24, loop1: 10.10.1.200/24, loop2: 10.10.2.200/24

#### 1.2 실습 환경 배포

**Vagrant를 통한 자동 배포:**

```bash
# 실습 환경 배포
mkdir cilium-lab && cd cilium-lab
curl -O https://raw.githubusercontent.com/gasida/vagrant-lab/refs/heads/main/cilium-study/5w/Vagrantfile
vagrant up

# 기본 정보 확인
vagrant ssh k8s-ctr

# 호스트 정보 확인
cat /etc/hosts
for i in k8s-w0 k8s-w1 router; do 
  echo ">> node : $i <<"
  sshpass -p 'vagrant' ssh -o StrictHostKeyChecking=no vagrant@$i hostname
  echo
done
```

#### 1.3 클러스터 기본 정보 확인

**클러스터 설정 확인:**

```bash
# 클러스터 정보
kubectl cluster-info
kubectl cluster-info dump | grep -m 2 -E "cluster-cidr|service-cluster-ip-range"

# 노드 정보 확인
kubectl get node -owide
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.podCIDR}{"\n"}{end}'

# Cilium 설정 확인 (BGP Control Plane 미리 활성화됨)
cilium config view | grep -i bgp
# Expected output:
# bgp-router-id-allocation-ip-pool: default
# bgp-router-id-allocation-mode: 
# bgp-secrets-namespace: kube-system
# enable-bgp-control-plane: true
# enable-bgp-control-plane-status-report: true
```

#### 1.4 네트워크 정보 확인

**라우팅 정보 분석:**

```bash
# autoDirectNodeRoutes=false 확인 (BGP로 경로 학습 예정)
cilium config view | grep auto-direct-node-routes

# 각 노드의 네트워크 인터페이스 확인
ip -c -4 addr show dev eth1
for i in w1 w0; do 
  echo ">> node : k8s-$i <<"
  sshpass -p 'vagrant' ssh vagrant@k8s-$i ip -c -4 addr show dev eth1
  echo
done

# 라우팅 테이블 확인 (노드별 PodCIDR 라우팅 없음을 확인)
ip -c route | grep static
for i in w1 w0; do 
  echo ">> node : k8s-$i <<"
  sshpass -p 'vagrant' ssh vagrant@k8s-$i ip -c route
  echo
done
```

### 2. 샘플 애플리케이션 배포 및 통신 문제 확인

#### 2.1 샘플 애플리케이션 배포

```bash
# 3개 노드에 분산 배포될 샘플 애플리케이션
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
                - sample-app
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

# 테스트 클라이언트 배포
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

#### 2.2 통신 문제 확인

**현재 상황: 노드 내의 파드들끼리만 통신 가능**

```bash
# 배포 상태 확인
kubectl get deploy,svc,ep webpod -owide
kubectl get endpointslices -l app=webpod
kubectl get ciliumendpoints

# 통신 테스트 (일부 Pod에만 연결됨)
kubectl exec -it curl-pod -- curl -s --connect-timeout 1 webpod | grep Hostname
kubectl exec -it curl-pod -- sh -c 'while true; do curl -s --connect-timeout 1 webpod | grep Hostname; echo "---"; sleep 1; done'

# Cilium 상태 확인
kubectl exec -n kube-system ds/cilium -- cilium-dbg endpoint list
kubectl exec -n kube-system ds/cilium -- cilium-dbg service list
kubectl exec -n kube-system ds/cilium -- cilium-dbg bpf lb list
```

**문제 원인:**
- autoDirectNodeRoutes=false로 설정되어 노드 간 자동 라우팅 비활성화
- BGP를 통한 동적 라우팅이 아직 설정되지 않음
- k8s-w0 노드는 다른 네트워크 대역에 위치하여 직접 통신 불가

## Cilium BGP Control Plane 심화 분석

### 1. BGP Control Plane 개념 및 아키텍처

#### 1.1 Cilium BGP Control Plane 소개

![](https://velog.velcdn.com/images/juwon8891/post/8b995f05-81c7-4dd3-ac58-91d149aea9ea/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/92dc9fe6-54de-4ae9-ab9e-ba34c3742125/image.png)

Cilium BGP Control Plane (BGPv2)는 Cilium Custom Resources를 통해 BGP 설정을 관리할 수 있는 고급 네트워킹 기능이다. Kubernetes 네이티브 방식으로 BGP 설정을 선언적으로 관리할 수 있게 해준다.

**CRD 기반 설정 관리:**

Cilium BGP는 4개의 주요 Custom Resource Definitions를 통해 계층적이고 유연한 BGP 설정을 제공한다:

| CRD | 역할 |
|-----|------|
| CiliumBGPClusterConfig | 클러스터 전체 BGP 설정 - BGP 인스턴스 정의, 노드 셀렉터 적용 범위 제어, ASN 설정, 피어 그룹 및 정책 연결 |
| CiliumBGPPeerConfig | 재사용 가능한 피어링 설정 - BGP 타이머 및 세션 관리, 그레이스풀 리스타트 정책, Address Family 설정, 인증 및 보안 설정 |
| CiliumBGPAdvertisement | 광고 정책 정의 - PodCIDR 자동 광고, Service LoadBalancer IP 광고, 커스텀 프리픽스 및 라우팅 정책, 조건부 광고 |
| CiliumBGPNodeConfigOverride | 노드별 세부 제어 - 특정 노드의 BGP 설정 오버라이드, 노드별 ASN 할당, 지역별 또는 역할별 차별화된 설정 |

#### 1.2 GoBGP 기반 구현의 특징

**Cilium BGP의 독특한 동작:**

- **컨트롤 플레인만 동작**: BGP 세션을 맺고 prefix를 광고하거나 수신
- **커널 라우팅 테이블 주입 안 함**: 수신한 경로를 Linux FIB에 바로 주입하지 않음
- **eBPF 내부 처리**: LoadBalancer 서비스 광고, PodCIDR 전파 용도로만 사용
- **GoBGP 기본 설정**: `disable-telemetry`, `disable-fib` 상태로 빌드됨

### 2. FRR 라우터 설정

#### 2.1 FRR 기본 설정 확인

```bash
# router 접속
sshpass -p 'vagrant' ssh vagrant@router

# FRR 프로세스 확인
ps -ef | grep frr
# Expected output:
# root 4127 1 0 13:38 ? 00:00:00 /usr/lib/frr/watchfrr -d -F traditional zebra bgpd staticd
# frr  4140 1 0 13:38 ? 00:00:00 /usr/lib/frr/zebra -d -F traditional -A 127.0.0.1 -s 90000000
# frr  4145 1 0 13:38 ? 00:00:00 /usr/lib/frr/bgpd -d -F traditional -A 127.0.0.1
# frr  4152 1 0 13:38 ? 00:00:00 /usr/lib/frr/staticd -d -F traditional -A 127.0.0.1

# FRR 설정 확인
vtysh -c 'show running'
vtysh -c 'show ip bgp summary'
vtysh -c 'show ip bgp'
vtysh -c 'show ip route'
```

#### 2.2 Cilium 노드와 BGP 피어링 설정

**방법 1: 설정 파일 직접 편집**

```bash
# /etc/frr/frr.conf 파일에 추가
cat << EOF >> /etc/frr/frr.conf
neighbor CILIUM peer-group
neighbor CILIUM remote-as external
neighbor 192.168.10.100 peer-group CILIUM
neighbor 192.168.10.101 peer-group CILIUM
neighbor 192.168.20.100 peer-group CILIUM
EOF

# FRR 서비스 재시작
systemctl daemon-reexec && systemctl restart frr
systemctl status frr --no-pager --full

# 로그 모니터링
journalctl -u frr -f
```

**방법 2: vtysh 대화형 설정**

```bash
vtysh
# BGP 설정 모드 진입
conf
router bgp 65000

# 피어 그룹 설정
neighbor CILIUM peer-group
neighbor CILIUM remote-as external
neighbor 192.168.10.100 peer-group CILIUM
neighbor 192.168.10.101 peer-group CILIUM
neighbor 192.168.20.100 peer-group CILIUM

# 설정 저장 및 종료
end
write memory
exit
```

### 3. Cilium BGP Control Plane 설정

#### 3.1 BGP 노드 라벨링

```bash
# BGP가 동작할 노드에 라벨 설정
kubectl label nodes k8s-ctr k8s-w0 k8s-w1 enable-bgp=true
kubectl get node -l enable-bgp=true
```

#### 3.2 Cilium BGP 설정 적용

```bash
# 터미널 1: FRR 로그 모니터링
journalctl -u frr -f

# 터미널 2: 통신 테스트 지속
kubectl exec -it curl-pod -- sh -c 'while true; do curl -s --connect-timeout 1 webpod | grep Hostname; echo "---"; sleep 1; done'

# BGP 설정 적용
cat << EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumBGPAdvertisement
metadata:
  name: bgp-advertisements
  labels:
    advertise: "bgp"
spec:
  advertisements:
  - advertisementType: "PodCIDR"
---
apiVersion: cilium.io/v2
kind: CiliumBGPPeerConfig
metadata:
  name: cilium-peer
spec:
  timers:
    holdTimeSeconds: 9
    keepAliveTimeSeconds: 3
  ebgpMultihop: 2
  gracefulRestart:
    enabled: true
    restartTimeSeconds: 15
  families:
  - afi: ipv4
    safi: unicast
    advertisements:
      matchLabels:
        advertise: "bgp"
---
apiVersion: cilium.io/v2
kind: CiliumBGPClusterConfig
metadata:
  name: cilium-bgp
spec:
  nodeSelector:
    matchLabels:
      "enable-bgp": "true"
  bgpInstances:
  - name: "instance-65001"
    localASN: 65001
    peers:
    - name: "tor-switch"
      peerASN: 65000
      peerAddress: 192.168.10.200  # router ip address
      peerConfigRef:
        name: "cilium-peer"
EOF
```

### 4. BGP 연결 및 통신 확인

#### 4.1 BGP 세션 상태 확인

```bash
# Cilium BGP 상태 확인
cilium bgp peers
cilium bgp routes available ipv4 unicast

# BGP 설정 리소스 확인
kubectl get ciliumbgpadvertisements,ciliumbgppeerconfigs,ciliumbgpclusterconfigs
kubectl get ciliumbgpnodeconfigs -o yaml | yq

# 예상 출력:
# "peeringState": "established"
# "routeCount": {"advertised": 2, "afi": "ipv4", "received": 1, "safi": "unicast"}
```

#### 4.2 FRR 라우터에서 BGP 정보 확인

```bash
# FRR에서 BGP 상태 확인
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp summary'"
# Expected output:
# Neighbor        V         AS MsgRcvd MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd   PfxSnt Desc
# 192.168.10.100  4      65001     509     511        0    0    0 00:25:15            1        4 N/A
# 192.168.10.101  4      65001     508     511        0    0    0 00:25:15            1        4 N/A
# 192.168.20.100  4      65001     509     511        0    0    0 00:25:15            1        4 N/A

sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp'"
# Expected routes:
# Network          Next Hop            Metric LocPrf Weight Path
# *> 172.20.0.0/24    192.168.10.100           0             0 65001 i
# *> 172.20.1.0/24    192.168.10.101           0             0 65001 i
# *> 172.20.2.0/24    192.168.20.100           0             0 65001 i

# 라우팅 테이블 확인
sshpass -p 'vagrant' ssh vagrant@router ip -c route | grep bgp
# Expected output:
# 172.20.0.0/24 nhid 32 via 192.168.10.100 dev eth1 proto bgp metric 20
# 172.20.1.0/24 nhid 30 via 192.168.10.101 dev eth1 proto bgp metric 20
# 172.20.2.0/24 nhid 31 via 192.168.20.100 dev eth2 proto bgp metric 20
```

### 5. 라우팅 문제 해결

#### 5.1 문제 상황 분석

**Cilium BGP의 특징:**
- BGP로 학습한 경로가 K8s 노드의 커널 라우팅 테이블에 주입되지 않음
- 2개 이상의 NIC 사용 시 노드에 직접 라우팅 설정이 필요
- Default Gateway가 eth0로 설정되어 있고, k8s 통신은 eth1 사용

#### 5.2 해결 방안: 정적 라우팅 설정

```bash
# 각 노드에 PodCIDR 대역에 대한 라우팅 설정
ip route add 172.20.0.0/16 via 192.168.10.200
sshpass -p 'vagrant' ssh vagrant@k8s-w1 sudo ip route add 172.20.0.0/16 via 192.168.10.200
sshpass -p 'vagrant' ssh vagrant@k8s-w0 sudo ip route add 172.20.0.0/16 via 192.168.20.200

# 라우팅 설정 확인
ip -c route | grep 172.20
sshpass -p 'vagrant' ssh vagrant@k8s-w1 ip -c route | grep 172.20
sshpass -p 'vagrant' ssh vagrant@k8s-w0 ip -c route | grep 172.20

# 통신 테스트 (성공 예상)
kubectl exec -it curl-pod -- sh -c 'while true; do curl -s --connect-timeout 1 webpod | grep Hostname; echo "---"; sleep 1; done'
```

#### 5.3 Hubble을 통한 트래픽 분석

```bash
# Hubble 포트 포워딩
cilium hubble port-forward &
hubble status

# 플로우 로그 모니터링
hubble observe -f --protocol tcp --pod curl-pod

# BGP 패킷 분석 (선택사항)
tcpdump -i eth1 tcp port 179 -w /tmp/bgp.pcap
termshark -r /tmp/bgp.pcap
```

### 6. 노드 유지보수 시나리오

#### 6.1 노드 유지보수 (k8s-w0 드레인)

```bash
# 현재 BGP 피어 상태 확인
cilium bgp peers
# Expected:
# Node     Local AS  Peer AS  Peer Address    Session State  Uptime      Family       Received  Advertised
# k8s-ctr  65001     65000    192.168.10.200  established    2h13m35s    ipv4/unicast 3         2
# k8s-w1   65001     65000    192.168.10.200  established    2h13m36s    ipv4/unicast 3         2

# 노드 드레인 및 BGP 비활성화
kubectl drain k8s-w0 --ignore-daemonsets
kubectl label nodes k8s-w0 enable-bgp=false --overwrite

# 상태 확인
kubectl get node
kubectl get ciliumbgpnodeconfigs
cilium bgp peers

# FRR에서 BGP 테이블 확인
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp summary'"
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp'"
sshpass -p 'vagrant' ssh vagrant@router ip -c route | grep bgp
```

#### 6.2 원복 설정

```bash
# BGP 재활성화 및 노드 복구
kubectl label nodes k8s-w0 enable-bgp=true --overwrite
kubectl uncordon k8s-w0

# Pod 재분배
kubectl scale deployment webpod --replicas 0
kubectl scale deployment webpod --replicas 3

# 상태 확인
kubectl get node
kubectl get ciliumbgpnodeconfigs
cilium bgp peers
```

## Service LoadBalancer BGP 광고

### 1. LoadBalancer IPAM과 BGP 통합

#### 1.1 LoadBalancer IP Pool 생성

```bash
# BGP로 광고할 LoadBalancer IP Pool 생성
cat << EOF | kubectl apply -f -
apiVersion: "cilium.io/v2"
kind: CiliumLoadBalancerIPPool
metadata:
  name: "cilium-pool"
spec:
  allowFirstLastIPs: "No"
  blocks:
  - cidr: "172.16.1.0/24"
EOF

# IP Pool 상태 확인
kubectl get ippool
# Expected output:
# NAME           DISABLED   CONFLICTING   IPS   AVAILABLE   AGE
# cilium-pool    false      False         254   254         8s
```

#### 1.2 LoadBalancer 서비스 생성

```bash
# webpod 서비스를 LoadBalancer 타입으로 변경
kubectl patch svc webpod -p '{"spec": {"type": "LoadBalancer"}}'

# 서비스 상태 확인
kubectl get svc webpod
# Expected output:
# NAME     TYPE           CLUSTER-IP     EXTERNAL-IP   PORTS         AGE
# webpod   LoadBalancer   10.96.39.92    172.16.1.1    80:30800/TCP  3h56m

# External Traffic Policy 확인
kubectl describe svc webpod | grep 'Traffic Policy'
# Expected: External Traffic Policy: Cluster, Internal Traffic Policy: Cluster
```

### 2. BGP Advertisement 설정

#### 2.1 LoadBalancer IP BGP 광고 설정

```bash
# LoadBalancer IP를 BGP로 광고하는 Advertisement 생성
cat << EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumBGPAdvertisement
metadata:
  name: bgp-advertisements-lb-exip-webpod
  labels:
    advertise: bgp
spec:
  advertisements:
  - advertisementType: "Service"
    service:
      addresses:
      - "LoadBalancerIP"
    selector:
      matchExpressions:
      - { key: app, operator: In, values: [ webpod ] }
EOF

# Advertisement 확인
kubectl get CiliumBGPAdvertisement
# Expected output:
# NAME                              AGE
# bgp-advertisements                2m1s
# bgp-advertisements-lb-exip-webpod 3s
```

#### 2.2 BGP 라우팅 정책 및 경로 확인

```bash
# BGP 라우팅 정책 확인
kubectl exec -it -n kube-system ds/cilium -- cilium-dbg bgp route-policies

# BGP 경로 확인
cilium bgp routes available ipv4 unicast
# Expected output showing LoadBalancer IP advertisement

# FRR에서 LoadBalancer IP 경로 확인
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp 172.16.1.1/32'"
# Expected output:
# BGP routing table entry for 172.16.1.1/32, version 7
# Paths: (3 available, best #1, table default)
#   65001
#     192.168.10.100 from 192.168.10.100 (192.168.10.100)
#       Origin IGP, valid, external, multipath, best
#   65001
#     192.168.20.100 from 192.168.20.100 (192.168.20.100)
#       Origin IGP, valid, external, multipath
#   65001
#     192.168.10.101 from 192.168.10.101 (192.168.10.101)
#       Origin IGP, valid, external, multipath
```

### 3. ECMP 및 LoadBalancer 트래픽 분석

#### 3.1 ECMP (Equal Cost Multi-Path) 동작 확인

```bash
# router에서 ECMP 라우팅 확인
sshpass -p 'vagrant' ssh vagrant@router ip -c route | grep 172.16.1.1
# Expected output:
# 172.16.1.1 nhid 71 proto bgp metric 20 
#   nexthop via 192.168.10.101 dev eth1 weight 1 
#   nexthop via 192.168.10.100 dev eth1 weight 1 
#   nexthop via 192.168.20.100 dev eth2 weight 1

# LoadBalancer IP 접근 테스트
LBIP=172.16.1.1
curl -s $LBIP | grep Hostname
curl -s $LBIP | grep RemoteAddr

# 반복 접속으로 로드밸런싱 확인
for i in {1..100}; do 
  curl -s $LBIP | grep Hostname
done | sort | uniq -c | sort -nr

# 지속적인 접속 테스트
while true; do 
  curl -s $LBIP | egrep 'Hostname|RemoteAddr'
  sleep 0.1
done
```

#### 3.2 External Traffic Policy 설정

![](https://velog.velcdn.com/images/juwon8891/post/a51e161a-e3c8-4767-be3f-53bf460b37d0/image.png)

**Cluster vs Local 정책 비교:**

![](https://velog.velcdn.com/images/juwon8891/post/81fbdb27-1db6-4fbb-b276-1a700d3120c2/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/dfb1ba42-d820-4eeb-a8ec-43483f33f67f/image.png)

```bash
# 현재 External Traffic Policy 확인
kubectl describe svc webpod | grep 'Traffic Policy'
# Expected: External Traffic Policy: Cluster

# replicas를 2로 줄여서 테스트
kubectl scale deployment webpod --replicas 2
kubectl get pod -owide

# 각 노드에서 패킷 모니터링 준비
# 터미널 1 (k8s-w1): tcpdump -i eth1 -A -s 0 -nn 'tcp port 80'
# 터미널 2 (k8s-w0): tcpdump -i eth1 -A -s 0 -nn 'tcp port 80'
# 터미널 3 (k8s-ctr): tcpdump -i eth1 -A -s 0 -nn 'tcp port 80'

# Cluster 모드에서 접속 테스트 (모든 노드로 분산)
for i in {1..100}; do 
  curl -s $LBIP | grep Hostname
done | sort | uniq -c | sort -nr
```

**Local 정책으로 변경:**

```bash
# External Traffic Policy를 Local로 변경
kubectl patch service webpod -p '{"spec":{"externalTrafficPolicy":"Local"}}'

# BGP 광고 상태 확인 (서비스에 대상 파드가 있는 노드만 광고)
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp'"
sshpass -p 'vagrant' ssh vagrant@router "sudo vtysh -c 'show ip bgp 172.16.1.1/32'"
sshpass -p 'vagrant' ssh vagrant@router ip -c route | grep 172.16.1.1

# Local 모드에서 접속 테스트 (소스 IP 보존)
for i in {1..100}; do 
  curl -s $LBIP | grep Hostname
done | sort | uniq -c | sort -nr

while true; do 
  curl -s $LBIP | egrep 'Hostname|RemoteAddr'
  sleep 0.1
done
```

#### 3.3 Linux ECMP Hash Policy 최적화

**ECMP 해시 정책 조정:**

```bash
# 현재 ECMP 해시 정책 확인 (router에서 실행)
sysctl net.ipv4.fib_multipath_hash_policy
# Expected: net.ipv4.fib_multipath_hash_policy = 0 (L3 hash - dest IP only)

# L4 해시로 변경 (더 정교한 부하분산)
sudo sysctl -w net.ipv4.fib_multipath_hash_policy=1
echo "net.ipv4.fib_multipath_hash_policy=1" >> /etc/sysctl.conf

# L4 해시 정책 설명:
# 0: L3 hash (default) - destination IP only
# 1: L4 hash - source IP, dest IP, source port, dest port based hash (more granular)

# 정책 변경 후 부하분산 테스트
kubectl scale deployment webpod --replicas 3
kubectl get pod -owide

for i in {1..100}; do 
  curl -s $LBIP | grep Hostname
done | sort | uniq -c | sort -nr
```

## Status Report 비활성화 (선택사항)

### 1. BGP Status Report 최적화

**대규모 클러스터에서의 고려사항:**

```bash
# 현재 BGP 상태 리포트 확인
kubectl get ciliumbgpnodeconfigs -o yaml | yq '.items[].status'

# BGP Status Report 비활성화 (API 서버 부하 감소)
helm upgrade cilium cilium/cilium --version 1.18.0 \
  --namespace kube-system \
  --reuse-values \
  --set bgpControlPlane.statusReport.enabled=false

kubectl -n kube-system rollout restart ds/cilium

# 비활성화 후 확인 (Status 정보 없음)
kubectl get ciliumbgpnodeconfigs -o yaml | yq '.items[].status'
# Expected: "status": {}
```

## Kind를 통한 ClusterMesh 실습

### 1. Kind 환경 소개

#### 1.1 Kind 개념 및 특징

![](https://velog.velcdn.com/images/juwon8891/post/3cb2105b-d850-4581-9890-58fe335e91c1/image.png)

Kind (Kubernetes in Docker)는 Docker 컨테이너를 Kubernetes 노드로 사용하는 도구로, 로컬 개발 및 테스트 환경에서 실제 Kubernetes 클러스터를 시뮬레이션할 수 있다.

**Kind의 핵심 장점:**

- **빠른 클러스터 생성**: Docker 기반으로 빠른 클러스터 생성 및 삭제, 1-2분 내 클러스터 준비
- **실제 환경과 유사한 구성**: kubeadm을 사용한 정식 클러스터 부트스트래핑, 멀티노드 클러스터 및 HA 지원
- **개발 친화적 기능**: 호스트 포트 매핑을 통한 서비스 노출, 볼륨 마운트, 다양한 Kubernetes 버전 지원
- **ClusterMesh 테스트에 최적**: 동일 Docker 네트워크에서 다중 클러스터 운영, 클러스터 간 직접 통신 가능

**Kind vs 기존 솔루션 비교:**

| 도구 | 특징 |
|------|------|
| minikube | 단일 노드 제한 |
| k3s | 경량화에 초점, 표준 Kubernetes와 차이 있음 |
| VM 기반 | 무거운 리소스 요구 |
| Kind | 멀티노드 지원, 표준 Kubernetes 환경, 컨테이너 기반 효율성 |

#### 1.2 Kind 설치 및 클러스터 배포

**Cilium CLI 설치:**

```bash
# macOS
brew install cilium-cli

# Linux
CILIUM_CLI_VERSION=$(curl -s https://raw.githubusercontent.com/cilium/cilium-cli/main/stable.txt)
CLI_ARCH=amd64
if [ "$(uname -m)" = "aarch64" ]; then CLI_ARCH=arm64; fi
curl -L --fail --remote-name-all \
  https://github.com/cilium/cilium-cli/releases/download/${CILIUM_CLI_VERSION}/cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}
sha256sum --check cilium-linux-${CLI_ARCH}.tar.gz.sha256sum
sudo tar xzvfC cilium-linux-${CLI_ARCH}.tar.gz /usr/local/bin
rm cilium-linux-${CLI_ARCH}.tar.gz{,.sha256sum}
```

**west 클러스터 배포:**

```bash
# west 클러스터 생성
kind create cluster --name west --image kindest/node:v1.33.2 --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000  # sample apps
    hostPort: 30000
  - containerPort: 30001  # hubble ui
    hostPort: 30001
- role: worker
  extraPortMappings:
  - containerPort: 30002  # sample apps
    hostPort: 30002
networking:
  podSubnet: "10.0.0.0/16"
  serviceSubnet: "10.2.0.0/16"
  disableDefaultCNI: true
  kubeProxyMode: none
EOF

# 기본 툴 설치
docker exec -it west-control-plane sh -c '
apt update && apt install tree psmisc lsof wget net-tools dnsutils tcpdump ngrep iputils-ping git -y'
docker exec -it west-worker sh -c '
apt update && apt install tree psmisc lsof wget net-tools dnsutils tcpdump ngrep iputils-ping git -y'
```

**east 클러스터 배포:**

```bash
# east 클러스터 생성
kind create cluster --name east --image kindest/node:v1.33.2 --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 31000  # sample apps
    hostPort: 31000
  - containerPort: 31001  # hubble ui
    hostPort: 31001
- role: worker
  extraPortMappings:
  - containerPort: 31002  # sample apps
    hostPort: 31002
networking:
  podSubnet: "10.1.0.0/16"
  serviceSubnet: "10.3.0.0/16"
  disableDefaultCNI: true
  kubeProxyMode: none
EOF

# 기본 툴 설치
docker exec -it east-control-plane sh -c '
apt update && apt install tree psmisc lsof wget net-tools dnsutils tcpdump ngrep iputils-ping git -y'
docker exec -it east-worker sh -c '
apt update && apt install tree psmisc lsof wget net-tools dnsutils tcpdump ngrep iputils-ping git -y'
```

#### 1.3 Kind 환경 확인

```bash
# 클러스터 컨텍스트 확인
kubectl config get-contexts
# Expected output:
# CURRENT   NAME        CLUSTER     AUTHINFO    NAMESPACE
# *         kind-east   kind-east   kind-east   
#           kind-west   kind-west   kind-west

# alias 설정
alias kwest='kubectl --context kind-west'
alias keast='kubectl --context kind-east'

# 클러스터 정보 확인
kwest get node -owide
keast get node -owide

# Docker 네트워크 확인
docker network ls | grep kind
docker ps -q | xargs docker inspect --format '{{.Name}} {{.NetworkSettings.Networks.kind.IPAddress}}'
```

### 2. Cilium CNI 배포

#### 2.1 west 클러스터 Cilium 설치

```bash
# west 클러스터용 Cilium 설치
cilium install --version 1.17.6 --set ipam.mode=kubernetes \
  --set kubeProxyReplacement=true --set bpf.masquerade=true \
  --set endpointHealthChecking.enabled=false --set healthChecking=false \
  --set operator.replicas=1 --set debug.enabled=true \
  --set routingMode=native --set autoDirectNodeRoutes=true --set ipv4NativeRoutingCIDR=10.0.0.0/16 \
  --set ipMasqAgent.enabled=true --set ipMasqAgent.config.nonMasqueradeCIDRs='{10.1.0.0/16}' \
  --set cluster.name=west --set cluster.id=1 \
  --context kind-west

# 설치 상태 모니터링
watch kubectl get pod -n kube-system --context kind-west
```

#### 2.2 east 클러스터 Cilium 설치

```bash
# east 클러스터용 Cilium 설치
cilium install --version 1.17.6 --set ipam.mode=kubernetes \
  --set kubeProxyReplacement=true --set bpf.masquerade=true \
  --set endpointHealthChecking.enabled=false --set healthChecking=false \
  --set operator.replicas=1 --set debug.enabled=true \
  --set routingMode=native --set autoDirectNodeRoutes=true --set ipv4NativeRoutingCIDR=10.1.0.0/16 \
  --set ipMasqAgent.enabled=true --set ipMasqAgent.config.nonMasqueradeCIDRs='{10.0.0.0/16}' \
  --set cluster.name=east --set cluster.id=2 \
  --context kind-east

# 설치 상태 모니터링
watch kubectl get pod -n kube-system --context kind-east
```

#### 2.3 Cilium 상태 확인

```bash
# 양 클러스터 상태 확인
kwest get pod -A && keast get pod -A

cilium status --context kind-west
cilium status --context kind-east

# 설정 확인
cilium config view --context kind-west
cilium config view --context kind-east

# 라우팅 정보 확인
docker exec -it west-control-plane ip -c route
docker exec -it west-worker ip -c route
docker exec -it east-control-plane ip -c route
docker exec -it east-worker ip -c route
```

### 3. ClusterMesh 설정

#### 3.1 ClusterMesh 활성화

```bash
# 각 클러스터에서 ClusterMesh 활성화
cilium clustermesh enable --service-type NodePort --enable-kvstoremesh=false --context kind-west
cilium clustermesh enable --service-type NodePort --enable-kvstoremesh=false --context kind-east

# clustermesh-apiserver 서비스 확인
kwest get svc,ep -n kube-system clustermesh-apiserver
keast get svc,ep -n kube-system clustermesh-apiserver

# 상태 모니터링
cilium clustermesh status --context kind-west --wait
cilium clustermesh status --context kind-east --wait
```

#### 3.2 클러스터 연결

```bash
# 클러스터 간 연결 설정
cilium clustermesh connect --context kind-west --destination-context kind-east

# 연결 상태 확인
cilium status --context kind-west
cilium status --context kind-east

# 예상 출력:
# ClusterMesh: 1/1 remote clusters ready, 0 global-services
# east: ready, 2 nodes, 4 endpoints, 3 identities, 0 services
```

#### 3.3 라우팅 자동 주입 확인

**ClusterMesh 설정 시 자동 라우팅:**

```bash
# 라우팅 정보 확인 (클러스터 간 PodCIDR 자동 주입)
docker exec -it west-control-plane ip -c route | grep 10.1
docker exec -it west-worker ip -c route | grep 10.1
docker exec -it east-control-plane ip -c route | grep 10.0
docker exec -it east-worker ip -c route | grep 10.0

# Expected routes:
# west cluster: 10.1.0.0/16 via east cluster nodes
# east cluster: 10.0.0.0/16 via west cluster nodes
```

### 4. 멀티클러스터 통신 테스트

#### 4.1 테스트 Pod 배포

```bash
# west 클러스터에 curl-pod 배포
cat << EOF | kubectl apply --context kind-west -f -
apiVersion: v1
kind: Pod
metadata:
  name: curl-pod
  labels:
    app: curl
spec:
  containers:
  - name: curl
    image: nicolaka/netshoot
    command: ["tail"]
    args: ["-f", "/dev/null"]
terminationGracePeriodSeconds: 0
EOF

# east 클러스터에 curl-pod 배포
cat << EOF | kubectl apply --context kind-east -f -
apiVersion: v1
kind: Pod
metadata:
  name: curl-pod
  labels:
    app: curl
spec:
  containers:
  - name: curl
    image: nicolaka/netshoot
    command: ["tail"]
    args: ["-f", "/dev/null"]
terminationGracePeriodSeconds: 0
EOF
```

#### 4.2 클러스터 간 직접 통신 테스트

```bash
# Pod IP 확인
kwest get pod -owide
keast get pod -owide

# west에서 east로 ping (직접 라우팅)
kubectl exec -it curl-pod --context kind-west -- ping -c 1 10.1.0.128

# east에서 west로 ping (직접 라우팅)
kubectl exec -it curl-pod --context kind-east -- ping -c 1 10.0.0.144

# 패킷 추적 (NAT 없이 직접 라우팅 확인)
kubectl exec -it curl-pod --context kind-east -- tcpdump -i eth0 -nn icmp
docker exec -it east-control-plane tcpdump -i any icmp -nn
```

### 5. Hubble 활성화

#### 5.1 west 클러스터 Hubble 설정

```bash
# west 클러스터 Hubble 활성화
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set hubble.enabled=true --set hubble.relay.enabled=true --set hubble.ui.enabled=true \
  --set hubble.ui.service.type=NodePort --set hubble.ui.service.nodePort=30001 \
  --kube-context kind-west

kwest -n kube-system rollout restart ds/cilium

# Hubble UI 접속 확인
kwest get svc,ep -n kube-system hubble-ui
open http://localhost:30001
```

#### 5.2 east 클러스터 Hubble 설정

```bash
# east 클러스터 Hubble 활성화
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set hubble.enabled=true --set hubble.relay.enabled=true --set hubble.ui.enabled=true \
  --set hubble.ui.service.type=NodePort --set hubble.ui.service.nodePort=31001 \
  --kube-context kind-east

keast -n kube-system rollout restart ds/cilium

# Hubble UI 접속 확인
keast get svc,ep -n kube-system hubble-ui
open http://localhost:31001
```

## Cilium MCS API (Multi-Cluster Services)

### 1. MCS API 개념

#### 1.1 Multi-Cluster Services 소개

![](https://velog.velcdn.com/images/juwon8891/post/b2626c3e-c1f0-49de-a06c-8cd516da6c50/image.png)

Multi-Cluster Services (MCS) API는 Kubernetes SIG-Multicluster에서 정의한 표준으로, 여러 클러스터에 걸쳐 서비스를 안전하고 투명하게 공유할 수 있게 해주는 기술이다.

**MCS API의 핵심 개념과 동작 원리:**

| 개념 | 설명 |
|------|------|
| ServiceExport | 로컬 서비스를 다른 클러스터에서 접근 가능하도록 내보내기. 네임스페이스 스코프로 세밀한 제어 가능, 자동 서비스 등록 및 광고 |
| ServiceImport | 원격 클러스터의 서비스를 로컬에서 사용. 자동 생성되는 프록시 서비스, 로컬 DNS 통합 (`*.svc.clusterset.local`) |
| 글로벌 서비스 발견 | DNS 기반 서비스 발견 (`service.namespace.svc.clusterset.local` 형식), 자동 엔드포인트 동기화, 헬스체크 통합 |
| 로드밸런싱 및 트래픽 관리 | 멀티클러스터 엔드포인트 트래픽 분산, 지역성 기반 라우팅, 가중치 기반 분배, 서킷 브레이커 |

**MCS API의 실제 활용 시나리오:**

| 시나리오 | 설명 |
|----------|------|
| 마이크로서비스 분산 | 서비스별 클러스터 분산 배치 |
| 재해 복구 | 액티브-패시브 멀티클러스터 구성 |
| 블루-그린 배포 | 클러스터 단위 무중단 배포 |
| 데이터 지역성 | 지역별 데이터 처리 및 캐싱 |

#### 1.2 MCS API 활성화

```bash
# west 클러스터에서 MCS API 활성화
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set clustermesh.useAPIServer=true \
  --set clustermesh.config.enabled=true \
  --set clustermesh.apiserver.service.type=NodePort \
  --kube-context kind-west

# east 클러스터에서 MCS API 활성화
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set clustermesh.useAPIServer=true \
  --set clustermesh.config.enabled=true \
  --set clustermesh.apiserver.service.type=NodePort \
  --kube-context kind-east
```

### 2. MCS API 실습

#### 2.1 서비스 Export/Import 예제

```bash
# west 클러스터에 웹 서비스 배포
cat << EOF | kubectl apply --context kind-west -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: webapp
        image: traefik/whoami
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: webapp
spec:
  selector:
    app: webapp
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
EOF

# 서비스 내보내기 (ServiceExport)
cat << EOF | kubectl apply --context kind-west -f -
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ServiceExport
metadata:
  name: webapp
spec: {}
EOF
```

#### 2.2 멀티클러스터 서비스 접근

```bash
# east 클러스터에서 west의 서비스에 접근
kubectl exec -it curl-pod --context kind-east -- nslookup webapp.default.svc.clusterset.local
kubectl exec -it curl-pod --context kind-east -- curl webapp.default.svc.clusterset.local

# ServiceImport 자동 생성 확인
keast get serviceimport

# 글로벌 서비스 엔드포인트 확인
keast get endpointslice -l multicluster.kubernetes.io/service-name=webapp
```

## 고급 설정 및 최적화

### 1. BGP Auto-Discovery

**ToR Switch와 Server 간 BGP 작업 편의성:**

```bash
# FRR BGP Listen Range 설정
vtysh
conf
router bgp 65000
bgp listen range 192.168.10.0/24 peer-group CILIUM
bgp listen range 192.168.20.0/24 peer-group CILIUM
end
write memory
```

**Default Gateway Auto-Discovery:**
- 노드의 기본 게이트웨이를 자동으로 BGP 피어로 설정
- 대규모 환경에서 설정 자동화 지원

### 2. 성능 최적화 및 모니터링

#### 2.1 BGP 성능 튜닝

```bash
# BGP 타이머 최적화
cat << EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumBGPPeerConfig
metadata:
  name: optimized-peer
spec:
  timers:
    holdTimeSeconds: 180      # 기본값보다 높여 안정성 증대
    keepAliveTimeSeconds: 60  # 기본값보다 높여 CPU 부하 감소
  gracefulRestart:
    enabled: true
    restartTimeSeconds: 120   # 재시작 시간 증가
EOF
```

#### 2.2 ClusterMesh 최적화

```bash
# etcd 성능 최적화
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set clustermesh.apiserver.etcd.resources.requests.cpu=200m \
  --set clustermesh.apiserver.etcd.resources.requests.memory=512Mi \
  --set clustermesh.apiserver.etcd.resources.limits.cpu=1000m \
  --set clustermesh.apiserver.etcd.resources.limits.memory=1Gi
```

### 3. 트러블슈팅 가이드

#### 3.1 BGP 연결 문제

```bash
# BGP 세션 상태 확인
cilium bgp peers

# BGP 로그 확인
kubectl logs -n kube-system -l k8s-app=cilium -c cilium-agent | grep "subsys=bgp-control-plane"
kubectl logs -n kube-system -l name=cilium-operator | grep "subsys=bgp-cp-operator"

# 네트워크 연결성 확인
kubectl exec -n kube-system ds/cilium -c cilium-agent -- cilium-dbg troubleshoot bgp
```

#### 3.2 ClusterMesh 연결 문제

```bash
# ClusterMesh 상태 확인
cilium clustermesh status --wait

# 원격 클러스터 연결 확인
kubectl exec -it -n kube-system ds/cilium -c cilium-agent -- cilium-dbg troubleshoot clustermesh

# etcd 연결 상태 확인
kubectl get ciliumnode -o yaml | yq '.items[].status.cluster-mesh'
```

#### 3.3 일반적인 해결책

**BGP 피어링 실패:**
```bash
# 방화벽 확인
ss -tnlp | grep 179
iptables -L | grep 179

# 라우팅 테이블 확인
ip route show table all
```

**ClusterMesh 인증서 문제:**
```bash
# 인증서 상태 확인
kubectl get secret -n kube-system | grep cilium-ca

# 인증서 재생성
cilium clustermesh enable --service-type NodePort --enable-kvstoremesh=false
```

## 프로덕션 운영 고려사항

### 1. 확장성 계획

#### 1.1 대규모 클러스터 BGP 설계

**계층적 BGP 설계 (Spine-Leaf Architecture):**

대규모 Kubernetes 환경에서 Cilium BGP Control Plane을 효과적으로 활용하기 위해서는 Spine-Leaf 구조를 이해하고 적용하는 것이 중요한다.

**Spine-Leaf 아키텍처의 핵심 특징:**

| 계층 | 역할 | AS 설계 |
|------|------|---------|
| Spine Layer | 백본 네트워크, 모든 Leaf 스위치와 연결, 전체 라우팅 테이블 집약 | 동일 ASN 사용 (AS 65000), 최소 2개 이상으로 고가용성 보장 |
| Leaf Layer | ToR(Top of Rack) 스위치, 서버와 직접 연결 | 각 Leaf별 고유 ASN (AS 65001, 65002, ...) |
| Server Layer | Kubernetes 노드, Cilium BGP Agent 실행 | 클러스터별 또는 노드별 ASN 할당 |

**ASN 할당 전략:**
- Private ASN 범위 활용: 64512-65534 (16-bit), 4200000000-4294967294 (32-bit)
- 계층적 할당:
  - Spine: AS 65000
  - Leaf: AS 65001-65099 (리전/존별)
  - K8s Cluster: AS 65100-65199 (클러스터별)
  - 예약 구간: AS 65200-65299 (확장용)

**BGP 정책 설계:**

| 기법 | 설명 |
|------|------|
| Route Reflector | 대규모 환경에서 Spine을 RR로 활용 |
| Community Tagging | 트래픽 엔지니어링 및 정책 적용 |
| AS-Path Prepending | 경로 우선순위 조정 |
| Route Filtering | 불필요한 경로 필터링 |

**고가용성 및 성능 최적화:**

| 기법 | 설명 |
|------|------|
| ECMP | 동일 비용 경로를 통한 로드밸런싱 |
| BFD (Bidirectional Forwarding Detection) | 빠른 장애 감지 |
| BGP Graceful Restart | 무중단 BGP 세션 유지보수 |
| Route Dampening | 불안정한 경로 억제 |

**확장성 고려사항:**

- **모듈러 확장**: Leaf-Server 단위 점진적 확장
- **대역폭 오버서브스크립션**: 적절한 오버서브스크립션 비율 유지
- **라우팅 테이블 크기**: 각 계층별 라우팅 테이블 최적화
- **컨버전스 시간**: 네트워크 수렴 시간 최소화

#### 1.2 멀티리전 ClusterMesh

```bash
# 리전별 클러스터 ID 체계
# Region 1: cluster.id 1-99
# Region 2: cluster.id 100-199
# Region 3: cluster.id 200-299

# 리전 간 연결 설정
cilium clustermesh enable --cluster-id 1 --cluster-name seoul-prod
cilium clustermesh enable --cluster-id 101 --cluster-name tokyo-prod
cilium clustermesh connect --context seoul-prod --destination-context tokyo-prod
```

### 2. 보안 고려사항

#### 2.1 BGP 보안 강화

```bash
# BGP MD5 인증 설정
kubectl create secret generic bgp-auth \
  --from-literal=password=$(openssl rand -base64 32)

# 네트워크 정책으로 BGP 트래픽 제한
cat << EOF | kubectl apply -f -
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: bgp-security-policy
spec:
  endpointSelector:
    matchLabels:
      k8s-app: cilium
  egress:
  - toPorts:
    - ports:
      - port: "179"
        protocol: TCP
    toFQDNs:
    - matchPattern: "*.company.com"
EOF
```

#### 2.2 ClusterMesh 보안

```bash
# mTLS 인증서 자동 갱신
helm upgrade cilium cilium/cilium --version 1.17.6 \
  --namespace kube-system --reuse-values \
  --set clustermesh.apiserver.tls.auto.enabled=true \
  --set clustermesh.apiserver.tls.auto.method=cronJob \
  --set clustermesh.apiserver.tls.auto.schedule="0 0 1 */2 *"  # 2개월마다 갱신
```

### 3. 모니터링 및 알림

#### 3.1 필수 메트릭

```bash
# BGP 관련 주요 메트릭
cilium_bgp_session_up                    # BGP 세션 상태
cilium_bgp_announced_prefixes_total      # 광고된 프리픽스 수
cilium_bgp_received_prefixes_total       # 수신된 프리픽스 수

# ClusterMesh 관련 주요 메트릭
cilium_clustermesh_remote_clusters       # 연결된 원격 클러스터 수
cilium_clustermesh_global_services       # 글로벌 서비스 수
cilium_clustermesh_endpoints_per_cluster # 클러스터별 엔드포인트 수
```

#### 3.2 알림 규칙 예시

```yaml
# Prometheus AlertManager 규칙
groups:
- name: cilium-bgp
  rules:
  - alert: BGPSessionDown
    expr: cilium_bgp_session_up == 0
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "BGP session down"
      description: "BGP session to {{ $labels.peer_address }} is down"

  - alert: ClusterMeshRemoteClusterDown
    expr: cilium_clustermesh_remote_clusters < 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "ClusterMesh remote cluster disconnected"
```


### 핵심 성취

**BGP Control Plane:**

- **아키텍처 이해**: Cilium BGP Control Plane v2 CRD 기반 설정 관리
- **FRR 피어링**: FRR과의 BGP 피어링 설정 및 운영
- **LoadBalancer 광고**: Service BGP 광고 및 IP Pool 연동
- **ECMP**: 고가용성 로드밸런싱 구현
- **Traffic Policy**: External Traffic Policy Cluster/Local 비교 및 최적화

**ClusterMesh:**

- **멀티클러스터 환경**: Kind 기반 west/east 클러스터 구축
- **직접 라우팅**: 클러스터 간 직접 라우팅 및 통신 확인
- **MCS API**: ServiceExport/Import를 통한 서비스 공유
- **가시성**: Hubble을 통한 멀티클러스터 트래픽 모니터링

### 운영 베스트 프랙티스

**BGP 운영:**

- **모니터링**: BGP 세션 상태 및 경로 정보 지속 감시
- **자동화**: BGP 설정 변경 자동화 및 검증
- **백업**: 경로 다중화를 통한 가용성 확보
- **보안**: MD5 인증 및 접근 제어 적용

**ClusterMesh 운영:**

- **인증서 관리**: 자동 갱신 및 만료 모니터링
- **네트워크 분할**: 클러스터 간 네트워크 세그멘테이션
- **성능 최적화**: etcd 및 apiserver 튜닝
- **장애 대응**: 클러스터 격리 및 복구 절차


### YouTube eCHO Episode 시리즈

**BGP 관련 에피소드:**

| 에피소드 | 내용 |
|----------|------|
| eCHO Episode 72 | BGP on Cilium - BGP Control Plane 상세 분석 |
| eCHO Episode 45 | Cilium Load Balancing - Service 로드밸런싱 원리 |
| eCHO Episode 39 | Local Redirect Policy - 로컬 트래픽 최적화 |

**ClusterMesh 관련 에피소드:**

| 에피소드 | 내용 |
|----------|------|
| eCHO Episode 56 | Service Mesh with Cilium - 멀티클러스터 서비스 메시 |
| eCHO Episode 84 | Multi-Cluster Networking - ClusterMesh 고급 설정 |
| eCHO Episode 92 | Cilium MCS API - Multi-Cluster Services 실습 |

### 공식 문서

**BGP Control Plane:**
- [Cilium BGP Control Plane v2 문서](https://docs.cilium.io/en/stable/network/bgp-control-plane/bgp-control-plane-v2/)
- [BGP Advertisement 설정 가이드](https://docs.cilium.io/en/stable/network/bgp-control-plane/bgp-advertisements/)
- [MetalLB에서 Cilium으로 마이그레이션](https://isovalent.com/blog/post/migrating-from-metallb-to-cilium/)

**ClusterMesh:**
- [ClusterMesh 설정 가이드](https://docs.cilium.io/en/stable/network/clustermesh/clustermesh/)
- [Multi-Cluster Services API](https://docs.cilium.io/en/stable/network/clustermesh/services/)
- [클러스터 간 네트워크 정책](https://docs.cilium.io/en/stable/security/policy/clustermesh/)

**Kind 환경:**
- [Kind 공식 문서](https://kind.sigs.k8s.io/)
- [Cilium with Kind 설정](https://docs.cilium.io/en/stable/installation/kind/)

### 블로그 및 케이스 스터디

- [Tencent Cloud - Cilium BGP 적용 사례](https://isovalent.com/blog/post/tencent-cloud-cilium/)
- [Adobe - 대규모 멀티클러스터 환경에서의 Cilium](https://medium.com/adobe-tech-blog/)
- [Trip.com - BGP Control Plane 운영 경험](https://isovalent.com/blog/post/trip-com-cilium/)
- [Isovalent Networking Design Guide](https://isovalent.com/resource-library/networking-design-guide/)
- [ECMP와 로드밸런싱 최적화](https://www.cisco.com/c/en/us/solutions/collateral/data-center-virtualization/application-centric-infrastructure/manage-ecmp-scale-aci-wp.html)
- [sessionAffinity와 Cilium](https://docs.cilium.io/en/stable/network/kubernetes/service/#session-affinity)
