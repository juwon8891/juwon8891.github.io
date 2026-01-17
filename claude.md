# Claude 작업 기록

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

---

**작업 완료 시각**: 2026-01-17
**작업자**: Claude (Sonnet 4.5)
