# Claude 작업 기록

## 2026-02-15 작업 내역

### 1. PDF 분석 및 정리 (Week 6)
- 파일: `(1) Kubespray offline 설치 _ Notion.pdf`
- PDF 내용 추출 및 분석 완료 (3,234 라인)
- Kubespray 폐쇄망(Air-Gap) 환경 offline 설치 실습 가이드 내용 정리

### 2. K8s-Deploy Week 6 학습정리 파일 생성
- 파일명: `_posts/2026-02-15-k8s-deploy-week6-kubespray-offline.md`
- Kubespray Offline 설치 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 5가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 6)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **폐쇄망 환경 아키텍처** - Internet → DMZ → 내부망 (Air-Gap) 구조
2. **NTP 동기화 흐름** - Internet NTP → admin → k8s-nodes
3. **NAT Gateway 동작 원리** - SNAT/DNAT 흐름
4. **Registry 이미지 해석 흐름** - FQDN 체크 → shortnames.conf → unqualified-search-registries
5. **kubespray-offline 전체 흐름** - Download → Setup → Deploy 단계
6. **이미지 Registry push 흐름** - Tag → Push → Storage
7. **Offline 배포 핵심 구성요소** - Nginx, Registry, YUM Repo, PyPI Mirror

## 2026-02-04 작업 내역

### 1. PDF 분석 및 정리 (Week 5)
- 파일: `(1) Kubespary HA & Upgrade.pdf`
- PDF 내용 추출 및 분석 완료 (Task 도구 사용)
- Kubespray HA 구성 및 노드 관리 실습 가이드 내용 정리

### 2. K8s-Deploy Week 5 학습정리 파일 생성
- 파일명: `_posts/2026-02-04-k8s-deploy-week5-kubespray-ha-upgrade.md`
- Kubespray HA & Upgrade 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 8가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 5)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Client-Side LoadBalancing 구조** - Nginx Static Pod를 통한 HA 구성
2. **External LB + Client-Side LB 구조** - HAProxy와 Nginx의 이중 장애 보호
3. **External LB Only 구조** - 모든 노드가 HAProxy 사용
4. **scale.yml 실행 흐름** - 노드 추가 프로세스
5. **remove-node.yml 실행 흐름** - 노드 제거 프로세스 (PDB 고려)
6. **Client-Side LoadBalancing 동작 원리** - kubelet → Nginx → API Server 흐름
7. **HAProxy LoadBalancing 구조** - Frontend, Backend, 통계 페이지
8. **Kubespray 변수 우선순위** - 6단계 Override Flow

## 2026-01-28 작업 내역

### 1. PDF 분석 및 정리 (Week 4)
- 파일: `(2) Kubespary 배포 분석.pdf`
- PDF 내용 추출 및 분석 완료 (5,053 라인)
- Kubespray 배포 및 내부 동작 분석 실습 가이드 내용 정리

### 2. K8s-Deploy Week 4 학습정리 파일 생성
- 파일명: `_posts/2026-01-28-k8s-deploy-week4-kubespray-deployment.md`
- Kubespray 배포 분석 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 4)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Kubespray 전체 실행 흐름** - 사전 검증부터 애드온 설치까지 15개 PLAY
2. **디렉터리 구조** - playbooks, roles, inventory 구조
3. **Role 의존성** - Role 간 의존성 및 실행 순서
4. **Container Engine 설치 과정** - Containerd, Runc, CNI Plugins 설치 흐름
5. **etcd 설치 및 구성** - 인증서 생성부터 systemd unit 설정까지
6. **Containerd Registry 미러 설정** - certs.d 기반 Registry 미러 메커니즘
7. **변수 우선순위** - Ansible 변수 우선순위 체계

## 2026-01-24 작업 내역

### 1. PDF 분석 및 정리 (Week 3)
- 파일: `(2) Kubeadm & K8S Upgrade.pdf`
- PDF 내용 추출 및 분석 완료 (Task 도구 사용)
- Kubeadm 클러스터 구축 및 업그레이드 실습 가이드 내용 정리

### 2. K8s-Deploy Week 3 학습정리 파일 생성
- 파일명: `_posts/2026-01-24-k8s-deploy-week3-kubeadm-upgrade.md`
- Kubeadm 및 K8s 업그레이드 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 7가지 Mermaid 다이어그램 포함

### 3. Mermaid 다이어그램 추가 (Week 3)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **kubeadm init 실행 흐름** - Preflight부터 애드온 설치까지 전체 과정
2. **kubeadm join 실행 흐름** - Discovery부터 노드 등록까지
3. **인증서 체인 구조** - CA별 인증서 계층 구조
4. **K8s 업그레이드 전략 비교** - In-Place vs Blue-Green
5. **업그레이드 흐름도** - Control Plane → Worker 노드 순차 업그레이드
6. **OverlayFS 레이어 구조** - Lower/Upper/Merged Layer
7. **Version Skew Policy** - 컴포넌트별 버전 호환성

## 2026-01-17 작업 내역

### 1. PDF 분석 및 정리 (Week 1)
- 파일: `(3) Bootstrap Kubernetes the hard way.pdf`
- PDF 내용 추출 및 분석 완료 (2,257 라인)
- Kubernetes The Hard Way 실습 가이드 내용 정리

### 2. K8s-Deploy Week 1 학습정리 파일 생성
- 파일명: `_posts/2026-01-10-k8s-deploy-week1-kubernetes-hard-way.md` (날짜: 2026-01-10)
- 새로운 스터디 시리즈 "[K8s-Deploy]" 시작
- PDF 내용을 체계적으로 마크다운 문서로 변환

### 3. 파일 수정
- "전체 커리큘럼 (예정)" 섹션 제거
- "Week 2 Preview" 섹션 제거
- 현재 주차 내용에 집중하도록 구성 변경

### 4. .gitignore 파일 생성
- `.DS_Store` 및 macOS 관련 파일 무시 설정
- Jekyll, Ruby, Bundler 관련 파일 무시 설정

### 5. Mermaid 다이어그램 추가 (Week 1)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **실습 아키텍처** - Control Plane과 Worker Node 구조
2. **인증서 체인 구조** - Root CA에서 각 컴포넌트 인증서까지의 관계
3. **인증/인가 흐름** - kubelet의 API 요청 시 Authentication → Authorization 흐름
4. **API Server → Kubelet 통신** - kubectl logs 실행 시 전체 흐름
5. **Pod 생성 흐름** - Deployment 생성부터 Pod 실행까지의 전체 과정
6. **Certificate → RBAC 매핑** - 인증서 Subject가 Kubernetes RBAC으로 매핑되는 과정

### 6. PDF 분석 및 정리 (Week 2)
- 파일: `(2) Ansible 기초.pdf`
- PDF 내용 추출 및 분석 완료 (2,354 라인)
- Ansible 기초 실습 가이드 내용 정리

### 7. K8s-Deploy Week 2 학습정리 파일 생성
- 파일명: `_posts/2026-01-17-k8s-deploy-week2-ansible-basics.md`
- Ansible 기초 내용을 체계적으로 마크다운 문서로 변환
- 주요 개념 5가지 Mermaid 다이어그램 포함

### 8. Mermaid 다이어그램 추가 (Week 2)
학습정리 파일에 주요 개념을 시각화한 Mermaid 다이어그램 추가:
1. **Ansible 아키텍처** - Control Node와 Managed Node 구조
2. **Control vs Managed Node** - 컴포넌트별 상세 구조
3. **Playbook 실행 흐름** - SSH 연결부터 Handler 실행까지 전체 과정
4. **Handler 동작 원리** - Task 변경 시 Handler notify 메커니즘
5. **Block 에러 처리** - Block, Rescue, Always 흐름
6. **변수 우선순위** - Extra vars부터 Role defaults까지 우선순위 체계
7. **롤 실행 순서** - Pre-tasks, Roles, Tasks, Post-tasks, Handlers 순서

## 학습 내용 요약

### Week 1: Bootstrap Kubernetes The Hard Way

**핵심 목표**: Kubernetes 클러스터를 kubeadm 없이 수동으로 구축하며 내부 동작 원리 이해

**주요 학습 포인트**:
1. **CA 및 TLS 인증서 구성**
   - Root CA 생성
   - 컴포넌트별 인증서 생성 (admin, kubelet, kube-proxy, scheduler, controller-manager, apiserver)
   - 인증서 Subject(CN, O)와 Kubernetes RBAC 관계 이해

2. **Kubeconfig 파일 생성**
   - 각 컴포넌트별 kubeconfig 작성
   - cluster, user, context 구조 이해

3. **Data Encryption at Rest**
   - etcd에 Secret 암호화 저장 (AES-CBC)
   - encryption-config.yaml 설정

4. **Control Plane 구성**
   - etcd 클러스터 구축
   - kube-apiserver 설정
   - kube-controller-manager 설정
   - kube-scheduler 설정
   - RBAC for kubelet authorization

5. **Worker Node 구성**
   - Container Runtime 설치 (containerd, runc)
   - CNI 플러그인 구성 (bridge, loopback)
   - kubelet 설정
   - kube-proxy 설정

6. **Pod Network Routes**
   - Pod CIDR 구성
   - 수동 라우팅 설정 (CNI 없이)

7. **Smoke Test**
   - Data Encryption 테스트
   - Deployment 테스트
   - Service 테스트

### 핵심 개념

**인증(Authentication) vs 인가(Authorization)**:
- 인증: "너는 누구냐?" (X.509 인증서, SA 토큰, OIDC)
- 인가: "너는 무엇을 할 수 있냐?" (Node Authorizer, RBAC)

**Node Authorizer**:
- Kubelet 전용 특수 권한 부여 모드
- `system:node:<nodeName>`, `system:nodes` 필수
- NodeRestriction Admission Controller와 함께 동작

**Certificate Subject와 RBAC**:
- CN (Common Name) → User
- O (Organization) → Group
- system:masters 그룹: 인가 우회, 슈퍼유저 권한

### Week 2: Ansible 기초

**핵심 목표**: Ansible을 통한 인프라 자동화 기초 학습 및 실습

**주요 학습 포인트**:
1. **Ansible 아키텍처**
   - Agentless 구조 (SSH 기반)
   - Control Node vs Managed Node
   - 멱등성(Idempotency) 개념

2. **Inventory 구성**
   - 호스트 그룹 관리
   - 변수 정의 (group_vars, host_vars)
   - 계층 구조 (children)

3. **Playbook 작성**
   - YAML 문법
   - Tasks, Handlers, Variables
   - Facts 수집 및 활용

4. **제어 구조**
   - 반복문 (loop, with_items)
   - 조건문 (when, 조건 연산자)
   - 에러 처리 (block, rescue, always)

5. **롤(Role) 구조**
   - 디렉터리 구조 (tasks, handlers, vars, defaults, files, templates)
   - 롤 생성 및 사용 (import_role, include_role)
   - Ansible Galaxy 활용

6. **주요 모듈**
   - 패키지 관리 (apt, dnf)
   - 서비스 관리 (service)
   - 파일 관리 (copy, file, template)
   - 명령 실행 (command, shell)

### 핵심 개념 비교

**변수 우선순위**:
- Extra vars (-e) > Task vars > Playbook vars > Host vars > Group vars > Role vars > Role defaults

**Handler vs Task**:
- Task: 즉시 실행
- Handler: notify 시에만 실행, 모든 Task 완료 후 1번만 실행

**import vs include**:
- import: 정적 로딩 (플레이북 파싱 시)
- include: 동적 로딩 (실행 시)

### Week 3: Kubeadm & K8S Upgrade

**핵심 목표**: kubeadm을 활용한 클러스터 구축 및 Kubernetes 버전 업그레이드

**주요 학습 포인트**:
1. **Kubeadm Deep Dive**
   - kubeadm init/join 실행 단계
   - Static Pod 기반 Control Plane 구성
   - TLS Bootstrap 메커니즘
   - ClusterConfiguration 및 Bootstrap 토큰 관리

2. **클러스터 구축 절차**
   - 사전 설정 (SELinux, Firewalld, Swap, 커널 파라미터)
   - Container Runtime 설치 (Containerd, SystemdCgroup)
   - kubeadm, kubelet, kubectl 설치
   - Control Plane 초기화 및 Worker 노드 참여
   - CNI 설치 (Flannel)

3. **인증서 관리**
   - CA 및 컴포넌트 인증서 (1년 유효기간)
   - Kubelet 인증서 자동 갱신
   - 인증서 수동 갱신 (kubeadm certs renew)
   - 인증서 체인 구조 (Kubernetes CA, etcd CA, Front Proxy CA)

4. **모니터링 설정**
   - Metrics Server 설치 및 활용
   - Kube-Prometheus-Stack (Prometheus, Grafana, Alertmanager)
   - Control Plane 메트릭 수집 설정
   - x509 Certificate Exporter (인증서 만료 모니터링)

5. **Version Skew Policy**
   - 컴포넌트별 버전 호환성 정책
   - apiserver, kubelet, kcm, scheduler, kube-proxy 버전 관계
   - HA 환경에서의 버전 관리

6. **K8s 업그레이드 전략**
   - In-Place Upgrade vs Blue-Green Upgrade
   - Control Plane 순차 업그레이드
   - Worker 노드 Drain/Uncordon
   - ETCD 백업 및 복원

### 핵심 개념 상세

**OverlayFS와 Snapshotter**:
- OverlayFS: Lower Layer (이미지) + Upper Layer (컨테이너) → Merged View
- Snapshotter: 이미지 레이어를 스냅샷 단위로 관리 (overlayfs, native, btrfs, zfs)

**Swap 비활성화 이유**:
- 리소스 예측 불가능: Pod가 메모리 초과해도 죽지 않고 디스크 사용
- K8s 관리 철학 위배: OOMKilled 후 즉시 재시작이 K8s 철학
- 클러스터 성능 저하: 스케줄링 판단 오류 발생

**SystemdCgroup 설정**:
- kubelet과 containerd가 동일한 cgroup driver 사용 필수
- cgroup v2 사용 시 systemd cgroup 필수

**Version Skew Policy**:
- kubelet: apiserver보다 최대 -3 마이너 버전
- kcm/scheduler: apiserver보다 최대 -1 마이너 버전
- kubectl: apiserver보다 ±1 마이너 버전

### Week 4: Kubespray 배포 분석

**핵심 목표**: Ansible 기반 Kubespray를 활용한 프로덕션급 Kubernetes 클러스터 배포 및 내부 동작 분석

**주요 학습 포인트**:
1. **Kubespray 아키텍처**
   - 15개 PLAY, 559개 TASK를 통한 완전한 클러스터 구축
   - Ansible Role 기반 모듈화 구조
   - 디렉터리 구조 및 Role 의존성 이해

2. **Container Engine 설치**
   - Containerd, Runc, CNI Plugins 자동 설치
   - Registry 미러 설정 (certs.d 구조)
   - Systemd Cgroup 활성화

3. **etcd 구성**
   - etcd_deployment_type: host (systemd) vs kubeadm (Static Pod)
   - etcd 인증서 체계 (CA, Member, Admin, Node)
   - systemd unit으로 etcd 독립 관리

4. **Kubernetes 배포**
   - kubeadm init을 통한 Control Plane 구성
   - External etcd 연동
   - CNI 플러그인 설치 (Flannel, Calico, Cilium 지원)
   - 애드온 자동 설치 (CoreDNS, Metrics Server, Helm)

5. **인증서 자동 갱신**
   - auto_renew_certificates 설정
   - systemd timer를 통한 매달 자동 갱신
   - kubeadm certs renew 명령어

6. **HA 환경 지원**
   - Control Plane HA (Leader Election)
   - etcd HA (Raft consensus, 홀수 개 권장)
   - Client-Side LoadBalancing (Nginx 기반)

7. **클러스터 라이프사이클 관리**
   - 업그레이드 (upgrade-cluster.yml)
   - 스케일링 (scale.yml, remove-node.yml)
   - 백업/복구 (etcd snapshot)

8. **Inventory 기반 설정 관리**
   - group_vars를 통한 중앙 집중식 설정
   - 변수 우선순위 체계
   - 퍼블릭/폐쇄망 환경 지원

### 핵심 개념 상세

**Kubespray vs Kubeadm**:
- Kubespray: Ansible 기반 전체 자동화, IaC, 멀티 노드 동시 배포
- Kubeadm: CLI 도구, 부분 자동화, 각 노드별 수동 실행

**etcd Deployment Type**:
- host: systemd unit으로 etcd 실행 (독립 관리)
- kubeadm: Static Pod로 etcd 실행 (kubeadm에 종속)

**Role 기반 구조**:
- 재사용성: Role을 다른 Playbook에서 재사용
- 모듈화: 각 Role이 독립적인 기능 수행
- 유지보수성: Role별로 코드 관리

**Client-Side LoadBalancing**:
- Worker 노드에 Nginx LoadBalancer 구성
- API Server 장애 시 자동 failover
- 외부 LoadBalancer 불필요

### Week 5: Kubespray HA & Upgrade

**핵심 목표**: Kubespray를 활용한 고가용성(HA) Kubernetes 클러스터 구성 및 운영

**주요 학습 포인트**:
1. **실습 환경 구성**
   - Vagrant를 이용한 멀티 노드 클러스터 구성
   - admin-lb (HAProxy), 3 Control Plane, 2 Worker 노드
   - 초기화 스크립트 분석 (admin-lb.sh, init-cfg.sh)

2. **K8S API 엔드포인트 전략**
   - Case 1: Client-Side LoadBalancing (Nginx Static Pod)
   - Case 2: External LB + Client-Side LB (HAProxy + Nginx)
   - Case 3: External LB Only (HAProxy 단일 엔드포인트)

3. **노드 라이프사이클 관리**
   - scale.yml: 노드 추가 (약 3분)
   - remove-node.yml: 노드 제거 (약 2분)
   - reset.yml: 클러스터 완전 삭제

4. **장애 시나리오**
   - Control Plane 노드 장애 시 동작 확인
   - Client-Side LB 자동 failover 테스트
   - HAProxy Health Check 동작

5. **모니터링 설정**
   - kube-ops-view 설치 및 활용
   - HAProxy 통계 페이지 (http://192.168.10.10:9000/haproxy_stats)
   - Prometheus 메트릭 수집

6. **트러블슈팅**
   - 인증서 SAN 추가 (supplementary_addresses_in_ssl_keys)
   - Containerd rlimits 이슈 해결
   - PodDisruptionBudget으로 인한 Drain 실패

### 핵심 개념 상세

**Client-Side vs External LoadBalancing**:
- Client-Side LB: 각 노드에 Nginx Static Pod 배포, 외부 LB 불필요
- External LB: HAProxy 중앙 집중식 관리, 단일 엔드포인트
- 이중 장애 보호: External LB + Client-Side LB 조합

**Kubespray 변수 우선순위 (6단계)**:
1. roles/*/defaults/main.yml (기본값)
2. roles/*/vars/main.yml (내부 강제 변수)
3. inventory/mycluster/group_vars/*.yml (99% 여기서 조절)
4. inventory/mycluster/host_vars/<node>.yml (특정 노드만)
5. playbook vars (플레이북 로컬 변수)
6. --extra-vars (-e) (최우선)

**etcd Deployment Type**:
- host (systemd unit): 독립 관리, 업그레이드 용이 (프로덕션 권장)
- kubeadm (Static Pod): kubeadm 통합 관리

**PodDisruptionBudget과 Drain**:
- maxUnavailable: 0 설정 시 Drain 타임아웃 발생
- 해결: PDB 삭제, 설정 변경, 강제 Drain (--force)

**비정상 노드 강제 삭제**:
- reset_nodes=false: SSH 접속 안 함
- allow_ungraceful_removal=true: Drain 실패해도 계속 진행
- skip_confirmation=true: 확인 프롬프트 스킵

### Week 6: Kubespray Offline 설치

**핵심 목표**: 폐쇄망(Air-Gap) 환경에서 Kubespray를 활용한 Kubernetes 클러스터 배포

**주요 학습 포인트**:
1. **폐쇄망 환경 아키텍처**
   - Internet → 외부 방화벽 → DMZ (Bastion) → 내부 방화벽 → 내부망 (Air-Gap)
   - 내부망에서는 외부 인터넷 접속 불가
   - 필요 시 방화벽 정책 승인 후 Bastion Server를 통해 다운로드

2. **폐쇄망 서비스 구성**
   - Network Gateway (IGW, NATGW): iptables/nftables NAT Masquerading
   - NTP Server/Client: chrony를 통한 시간 동기화
   - DNS Server/Client: bind를 통한 도메인 이름 해석
   - Local YUM/DNF Repository: reposync + createrepo
   - Private Container Registry: registry:3.0.0 컨테이너
   - Private PyPI Mirror: devpi-server

3. **kubespray-offline 도구**
   - download-all.sh: 바이너리, 이미지, 패키지 다운로드 (17분, 3.3GB)
   - setup-container.sh: Containerd 설치, Registry/Nginx 이미지 load
   - start-nginx.sh: files, images, pypi, rpms 웹 서버로 제공
   - start-registry.sh: 프라이빗 이미지 저장소 기동 (:35000)
   - load-push-images.sh: 모든 이미지 Registry에 push (2분)
   - extract-kubespray.sh: Kubespray repo 압축 해제

4. **offline.yml 설정**
   - http_server: Nginx 웹 서버 주소
   - registry_host: 프라이빗 Registry 주소
   - containerd_registries_mirrors: Registry 미러 설정
   - files_repo, yum_repo, ubuntu_repo: 패키지 저장소 주소
   - kube_image_repo, gcr_image_repo 등: 이미지 저장소 Override

5. **클러스터 배포**
   - offline-repo playbook 실행: k8s-node에 offline repo 설정
   - 기존 repo 제거: rocky-*.repo → *.repo.original
   - ansible-playbook cluster.yml 실행 (3분)
   - kubectl, kubeconfig 설정 및 확인

6. **Troubleshooting**
   - Flannel 파드 정상 기동: 디폴트 라우팅 추가 필요
   - podman0 forward 허용: nftables rule 추가
   - etcd CPU arch 변수 수정: amd64 → arm64 (macOS 사용자)

### 핵심 개념 상세

**kubespray-offline vs contrib/offline**:
- kubespray-offline: Shell Script, download-all.sh, 사용 편의성 ⭐⭐⭐⭐⭐
- contrib/offline: Ansible Playbook, manage-offline-files.sh, 커스터마이징 용이

**NAT Gateway 동작 원리**:
- k8s-node → admin: Source IP 192.168.10.11 → 10.0.2.15 (SNAT)
- admin → Internet: 10.0.2.15로 요청
- Internet → admin: 10.0.2.15로 응답
- admin → k8s-node: Destination IP 10.0.2.15 → 192.168.10.11 (DNAT)

**iptables vs nftables**:
- iptables: Legacy, 여러 테이블(nat, filter, mangle), 개별 룰 추가/삭제
- nftables: Modern, 통합 인터페이스, 성능 개선, atomic 룰 업데이트

**Registry 이미지 해석 흐름**:
1. FQDN 있는가? (docker.io/library/nginx) → 해당 레지스트리에서 직접 pull
2. 000-shortnames.conf에 매핑 있는가? (alpine = docker.io/library/alpine) → 직접 pull
3. shortname-mode = enforcing → 사용자에게 선택 요구
4. shortname-mode = permissive → unqualified-search-registries 순서대로 시도

**PyPI Mirror +simple의 의미**:
- /root/prod: 사람용 웹 UI
- /root/prod/+simple: pip 전용 API 엔드포인트 (PEP 503 Simple API)
- pip는 반드시 +simple 붙인 URL 사용해야 정상 동작

**Containerd Registry Mirror 설정**:
- /etc/containerd/certs.d/192.168.10.10:35000/hosts.toml
- server, host, capabilities, skip_verify 설정
- kubelet → containerd → hosts.toml → Registry 연결

## 실습 환경

### Week 1: Kubernetes The Hard Way

### 가상머신 구성
| 호스트명 | IP | 역할 | vCPU | Memory |
|---------|-----|------|------|--------|
| jumpbox | 192.168.10.10 | 관리 호스트 | 2 | 1.5GB |
| server | 192.168.10.100 | Control Plane | 2 | 2GB |
| node-0 | 192.168.10.101 | Worker | 2 | 2GB |
| node-1 | 192.168.10.102 | Worker | 2 | 2GB |

### 네트워크 대역
- Cluster CIDR: 10.200.0.0/16
- node-0 Pod CIDR: 10.200.0.0/24
- node-1 Pod CIDR: 10.200.1.0/24
- Service CIDR: 10.32.0.0/24
- kubernetes Service ClusterIP: 10.32.0.1

### 컴포넌트 버전
- Kubernetes: v1.32.2
- etcd: v3.6.0
- containerd: v2.1.0
- runc: v1.3.0

### Week 2: Ansible 기초

### 가상머신 구성
| 호스트명 | IP | 역할 | OS |
|---------|-----|------|-----|
| ansible-server | 192.168.10.10 | Control Node | Ubuntu |
| tnode1 | 192.168.10.101 | Managed Node | Ubuntu 24.04 |
| tnode2 | 192.168.10.102 | Managed Node | Ubuntu 24.04 |
| tnode3 | 192.168.10.103 | Managed Node | Rocky Linux 9.6 |

### 주요 설정 파일
```ini
# ansible.cfg
[defaults]
inventory = ./inventory
remote_user = root
gathering = smart
fact_caching = jsonfile

[privilege_escalation]
become = true
become_method = sudo
```

### Week 3: Kubeadm & K8S Upgrade

### 가상머신 구성
| 호스트명 | IP | 역할 | vCPU | Memory | OS |
|---------|-----|------|------|--------|-----|
| k8s-ctr | 192.168.10.100 | Control Plane | 4 | 3GB | Rocky Linux 10.0 |
| k8s-w1 | 192.168.10.101 | Worker | 2 | 2GB | Rocky Linux 10.0 |
| k8s-w2 | 192.168.10.102 | Worker | 2 | 2GB | Rocky Linux 10.0 |

### 네트워크 설정
- Pod CIDR: 10.244.0.0/16
- Service CIDR: 10.96.0.0/16
- CNI: Flannel v0.27.3 (VXLAN)

### 컴포넌트 버전
- OS: Rocky Linux 10.0 (Kernel 6.12)
- Containerd: v2.1.5
- Runc: v1.3.3
- Kubernetes: v1.32.11
- Helm: v3.18.6

### 인증서 정보
| 인증서 | CN | O | 유효기간 | 용도 |
|--------|----|----|----------|------|
| ca.crt | kubernetes | - | 10년 | Root CA |
| etcd/ca.crt | etcd-ca | - | 10년 | etcd CA |
| apiserver.crt | kube-apiserver | - | 1년 | API Server TLS |
| apiserver-kubelet-client.crt | kube-apiserver-kubelet-client | kubeadm:cluster-admins | 1년 | API → Kubelet |
| kubelet-client.crt | system:node:k8s-ctr | system:nodes | 1년 (자동 갱신) | Kubelet Client |

### 모니터링 스택
- Metrics Server: kubelet 메트릭 수집
- Prometheus: http://192.168.10.100:30001
- Grafana: http://192.168.10.100:30002 (admin/prom-operator)
- x509 Certificate Exporter: 인증서 만료 모니터링

### Grafana 대시보드
- 15661: Kubernetes Cluster Monitoring
- 15757: Kubernetes Views Global
- 13922: x509 Certificate Exporter

### Week 4: Kubespray 배포 분석

### 가상머신 구성
| 호스트명 | IP | 역할 | vCPU | Memory | OS |
|---------|-----|------|------|--------|-----|
| k8s-ctr | 192.168.10.10 | Control Plane + Worker | 4 | 4GB | Rocky Linux 10.0 |

**특징**: Single Node 클러스터 (Control Plane과 Worker 겸용)

### 네트워크 설정
- Pod CIDR: 10.233.64.0/18
- Service CIDR: 10.233.0.0/18
- CNI: Flannel
- Kube Proxy Mode: iptables

### 컴포넌트 버전
- OS: Rocky Linux 10.0 (Kernel 6.12.0)
- Kubernetes: v1.33.3
- Containerd: v2.1.5
- Runc: v1.3.4
- etcd: v3.5.25
- Ansible: v2.17.14
- Python: 3.12.9
- Helm: v3.18.4

### Kubespray 정보
- Kubespray 버전: 2.29.x
- 지원 K8s 버전: 1.31 ~ 1.33
- 총 PLAY 수: 15개
- 총 TASK 수: 559개
- etcd Deployment Type: host (systemd unit)
- Container Manager: containerd
- Network Plugin: flannel

### 주요 설정
```yaml
# k8s-cluster.yml
kube_network_plugin: flannel
kube_proxy_mode: iptables
kube_service_addresses: 10.233.0.0/18
kube_pods_subnet: 10.233.64.0/18
enable_nodelocaldns: false
auto_renew_certificates: true
container_manager: containerd

# etcd.yml
etcd_deployment_type: host

# addons.yml
helm_enabled: true
metrics_server_enabled: true
node_feature_discovery_enabled: true
```

### Week 5: Kubespray HA & Upgrade

### 가상머신 구성
| 호스트명 | 역할 | CPU | RAM | IP 주소 | 초기화 스크립트 |
|----------|------|-----|-----|----------|-----------------|
| admin-lb | Kubespray 실행, API LB | 2 | 1GB | 192.168.10.10 | admin-lb.sh |
| k8s-node1 | Control Plane | 4 | 2GB | 192.168.10.11 | init-cfg.sh |
| k8s-node2 | Control Plane | 4 | 2GB | 192.168.10.12 | init-cfg.sh |
| k8s-node3 | Control Plane | 4 | 2GB | 192.168.10.13 | init-cfg.sh |
| k8s-node4 | Worker | 4 | 2GB | 192.168.10.14 | init-cfg.sh |
| k8s-node5 | Worker | 4 | 2GB | 192.168.10.15 | init-cfg.sh |

**특징**: HA Control Plane (3 Nodes) + 2 Worker Nodes + External LB (HAProxy)

### 네트워크 설정
- Pod CIDR: 10.233.64.0/18
- Service CIDR: 10.233.0.0/18
- CNI: Flannel
- Kube Proxy Mode: iptables
- CoreDNS ClusterIP: 10.233.0.3

### 컴포넌트 버전
- OS: Rocky Linux 10.0 (Kernel 6.12)
- Kubernetes: v1.32.9
- Kubespray: v2.29.1
- Containerd: v2.1.5
- etcd: v3.5.25
- Python: 3.12.9
- Helm: v3.18.6

### HAProxy 설정
- API Server LB: 192.168.10.10:6443
- 통계 페이지: http://192.168.10.10:9000/haproxy_stats
- Prometheus 메트릭: http://192.168.10.10:8405/metrics
- Backend: k8s-node1~3 (roundrobin)

### Kubespray 실행 정보
- 배포 소요 시간: 약 8분
- 노드 추가 (scale.yml): 약 3분
- 노드 제거 (remove-node.yml): 약 2분 (PDB 없을 시 20초)

### 모니터링
- kube-ops-view: http://192.168.10.14:30000/#scale=1.5

### Week 6: Kubespray Offline 설치

### 가상머신 구성
| 호스트명 | 역할 | CPU | RAM | IP 주소 | 초기화 스크립트 |
|----------|------|-----|-----|----------|-----------------|
| **admin** | Kubespray 실행, 폐쇄망 서비스 제공 | 4 | 2GB | 192.168.10.10 | admin.sh |
| **k8s-node1** | Control Plane | 4 | 2GB | 192.168.10.11 | init_cfg.sh |
| **k8s-node2** | Worker | 4 | 2GB | 192.168.10.12 | init_cfg.sh |

**특징**:
- admin 서버: 120GB 용량 (외부 인터넷 O)
- k8s-node: 외부 인터넷 X (admin을 통해 패키지 다운로드)

### 네트워크 설정
- Pod CIDR: 10.233.64.0/18
- Service CIDR: 10.233.0.0/18
- CNI: Flannel
- Kube Proxy Mode: iptables

### 컴포넌트 버전
| 컴포넌트 | 버전 |
|----------|------|
| OS | Rocky Linux 10.0 (Kernel 6.12) |
| Kubernetes | v1.34.3 |
| Kubespray | v2.30.0 |
| Containerd | v2.2.1 |
| Runc | v1.3.4 |
| Nerdctl | v2.2.1 |
| CNI Plugins | v1.8.0 |
| etcd | v3.5.26 |
| Python | 3.12.9 |
| Helm | v3.18.4 |
| Nginx (웹 서버) | 1.29.4 |
| Registry (이미지 저장소) | 3.0.0 |

### 폐쇄망 서비스 포트
| 서비스 | 포트 | 용도 |
|--------|------|------|
| Nginx 웹 서버 | 80 | files, images, pypi, rpms 제공 |
| Registry | 35000 | 프라이빗 이미지 저장소 |
| Registry Debug | 5001 | debug, metrics |
| DNS (bind) | 53 | 도메인 이름 해석 |
| NTP (chronyd) | 123 | 시간 동기화 |

### kubespray-offline 실행 정보
- download-all.sh 소요 시간: 약 17분 (3.3GB)
- load-push-images.sh 소요 시간: 약 2분
- ansible-playbook cluster.yml 소요 시간: 약 3분

## 생성된 인증서 목록

| 컴포넌트 | CN | O | 용도 |
|----------|----|----|------|
| Root CA | CA | - | 모든 인증서 서명 |
| admin | admin | system:masters | kubectl 관리자 |
| node-0 | system:node:node-0 | system:nodes | kubelet (node-0) |
| node-1 | system:node:node-1 | system:nodes | kubelet (node-1) |
| kube-proxy | system:kube-proxy | system:node-proxier | kube-proxy |
| kube-scheduler | system:kube-scheduler | system:kube-scheduler | scheduler |
| kube-controller-manager | system:kube-controller-manager | system:kube-controller-manager | controller-manager |
| kube-apiserver | kubernetes | - | API Server |
| service-accounts | service-accounts | - | SA 토큰 서명 |

## 주요 포트

| 컴포넌트 | 포트 | 용도 |
|----------|------|------|
| kube-apiserver | 6443 | HTTPS API |
| etcd | 2379 | Client 연결 |
| etcd | 2380 | Peer 연결 |
| kubelet | 10250 | HTTPS API (logs, exec, metrics) |
| kube-controller-manager | 10257 | HTTPS Health Check |
| kube-scheduler | 10259 | HTTPS Health Check |

## 프로덕션 전환 체크리스트

### 보안
- [ ] etcd TLS 통신 설정 (HTTP → HTTPS)
- [ ] etcd 클러스터 HA 구성 (3 또는 5 노드)
- [ ] Secret 암호화 활성화 (KMS v2 권장)
- [ ] 인증서 만료 모니터링 및 자동 갱신
- [ ] RBAC 최소 권한 원칙 적용
- [ ] system:masters 그룹 사용 제한
- [ ] Audit Log 활성화

### 고가용성
- [ ] API Server HA 구성 (LoadBalancer)
- [ ] etcd 분산 클러스터 (Raft consensus)
- [ ] Controller-Manager Leader Election
- [ ] Scheduler Leader Election

### 네트워킹
- [ ] CNI 플러그인 도입 (Calico, Cilium 권장)
- [ ] NetworkPolicy 활성화
- [ ] Service Mesh 고려 (Istio, Linkerd)

### 운영
- [ ] Monitoring (Prometheus, Grafana)
- [ ] Logging (EFK/ELK Stack)
- [ ] Backup & DR 전략 (Velero)
- [ ] 자동화된 업그레이드 프로세스

## 참고 자료

### Week 1: Kubernetes The Hard Way
- [Kubernetes The Hard Way - GitHub](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [멤버 상세 정리 (송이레님)](https://sirzzang.github.io/kubernetes/Kubernetes-Cluster-The-Hard-Way-00/)
- [Netpple K8s 딥다이브](https://netpple.github.io/docs/deepdive-into-kubernetes/)
- [Kubernetes 공식 문서 - 인증](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)
- [Kubernetes 공식 문서 - 인가](https://kubernetes.io/docs/reference/access-authn-authz/authorization/)
- [Kubernetes 공식 문서 - Node Authorization](https://kubernetes.io/docs/reference/access-authn-authz/node/)
- [Kubernetes 공식 문서 - Encrypting Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)

### Week 2: Ansible 기초
- [Ansible 공식 문서](https://docs.ansible.com/)
- [Ansible Galaxy](https://galaxy.ansible.com/)
- [Ansible Modules Index](https://docs.ansible.com/ansible/latest/collections/index_module.html)
- [Ansible Playbook Guide](https://docs.ansible.com/ansible/latest/playbook_guide/)
- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/tips_tricks/ansible_tips_tricks.html)
- [YAML Syntax](https://docs.ansible.com/ansible/latest/reference_appendices/YAMLSyntax.html)
- [Ansible Loops](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_loops.html)
- [Ansible Conditionals](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_conditionals.html)
- [Ansible Handlers](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_handlers.html)
- [Ansible Roles](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html)

### Week 3: Kubeadm & K8S Upgrade
- [kubeadm 공식 문서](https://kubernetes.io/docs/reference/setup-tools/kubeadm/)
- [Kubernetes Version Skew Policy](https://kubernetes.io/releases/version-skew-policy/)
- [Kubernetes Upgrade Guide](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)
- [Certificate Management](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)
- [etcd Backup and Restore](https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/)
- [Metrics Server](https://github.com/kubernetes-sigs/metrics-server)
- [Kube-Prometheus-Stack](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [x509 Certificate Exporter](https://github.com/enix/x509-certificate-exporter)
- [Flannel CNI](https://github.com/flannel-io/flannel)
- [Containerd](https://containerd.io/)
- [Container Runtime Interface (CRI)](https://kubernetes.io/docs/concepts/architecture/cri/)

### Week 4: Kubespray 배포 분석
- [Kubespray 공식 문서](https://kubespray.io/)
- [Kubespray GitHub](https://github.com/kubernetes-sigs/kubespray)
- [Kubespray Release Notes](https://github.com/kubernetes-sigs/kubespray/releases)
- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/tips_tricks/ansible_tips_tricks.html)
- [Kubernetes Version Skew Policy](https://kubernetes.io/releases/version-skew-policy/)
- [etcd 공식 문서](https://etcd.io/docs/)
- [Containerd Registry 설정](https://github.com/containerd/containerd/blob/main/docs/hosts.md)
- [Kubeadm Certificate Management](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-certs/)

### Week 5: Kubespray HA & Upgrade
- [Kubespray 공식 문서](https://kubespray.io/)
- [Kubespray GitHub](https://github.com/kubernetes-sigs/kubespray)
- [Kubespray HA Mode 문서](https://github.com/kubernetes-sigs/kubespray/blob/master/docs/operations/ha-mode.md)
- [Kubespray Node Management](https://github.com/kubernetes-sigs/kubespray/blob/master/docs/operations/nodes.md)
- [Kubeadm Reset Workflow](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-reset/)
- [PodDisruptionBudget 공식 문서](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- [HAProxy 공식 문서](http://www.haproxy.org/)
- [Nginx TCP/UDP LoadBalancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/tcp-udp-load-balancer/)
- [kube-ops-view GitHub](https://github.com/hjacobs/kube-ops-view)
- [Vagrant 공식 문서](https://www.vagrantup.com/docs)
- [송이레님 - Kubespray 엔드포인트 구성](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-05-00/)
- [송이레님 - Kubespray 노드 추가](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-06-00-01/)
- [송이레님 - Kubespray 노드 제거](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-06-00-02/)

### Week 6: Kubespray Offline 설치
- [Kubespray Offline Environment 공식 문서](https://kubespray.io/#/docs/offline-environment)
- [kubespray-offline GitHub](https://github.com/kubespray-offline/kubespray-offline)
- [송이레님 - Kubespray Offline Overview](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-00/)
- [송이레님 - Kubespray Offline 실습 환경 배포](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-00/)
- [송이레님 - Network Gateway](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-01/)
- [송이레님 - NTP / DNS](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-02/)
- [송이레님 - Local Package Repository](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-03/)
- [송이레님 - Private Container Registry](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-04/)
- [송이레님 - Private PyPI Mirror](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-05/)
- [송이레님 - Private Go Module Proxy](https://sirzzang.github.io/kubernetes/Kubernetes-Kubespray-08-01-06/)
- [박진형님 - kubespray-offline 설치 및 TS](https://sigridjin.medium.com/kubespray-ha-upgrade-a-hands-on-guide-from-v1-32-to-v1-34-43076ef54676)
- [박진형님 - kubespray-skills GitHub](https://github.com/sigridjineth/kubespray-skills)
- [Kubespray Download Optimization](https://kubespray.io/#/docs/download)
- [devpi 공식 문서](https://devpi.net/)
- [nftables 공식 문서](https://netfilter.org/projects/nftables/)

---

**최종 업데이트**: 2026-02-15
**작업자**: Claude (Sonnet 4.5)
