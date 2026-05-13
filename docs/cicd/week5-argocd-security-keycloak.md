
# ArgoCD 보안 및 인증: Keycloak SSO 연동과 접근 제어로 완성하는 엔터프라이즈 GitOps

> ArgoCD 보안 설정과 Keycloak SSO 연동을 학습합니다.

---

## 실습 환경 구성

### 1. kind Kubernetes 클러스터 배포

#### kind 클러스터 생성

**kind(Kubernetes IN Docker)**를 사용하여 로컬 개발 환경을 구성합니다.

```bash
# kind 클러스터 생성
kind create cluster --name myk8s --image kindest/node:v1.32.8 --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  labels:
    ingress-ready: true
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
  - containerPort: 30000
    hostPort: 30000
  - containerPort: 30001
    hostPort: 30001
  - containerPort: 30002
    hostPort: 30002
  - containerPort: 30003
    hostPort: 30003
EOF

# 클러스터 확인
kubectl cluster-info
kubectl get nodes

```
**extraPortMappings의 역할**:
- `containerPort: 80/443` → Ingress 트래픽
- `containerPort: 30000-30003` → NodePort 서비스 접근

#### kube-ops-view 설치

클러스터 리소스를 시각화하는 도구를 설치합니다.

```bash
# kube-ops-view 설치
helm repo add geek-cookbook https://geek-cookbook.github.io/charts/
helm install kube-ops-view geek-cookbook/kube-ops-view \
  --version 1.2.2 \
  --set service.main.type=NodePort,service.main.ports.http.nodePort=30001 \
  --set env.TZ="Asia/Seoul" \
  --namespace kube-system

# 접속 URL 확인
open "http://127.0.0.1:30001/#scale=1.5"

```
### 2. Ingress-Nginx 설치 및 설정

#### Ingress-Nginx 배포

**Ingress Controller**는 HTTP/HTTPS 트래픽을 클러스터 내부 서비스로 라우팅합니다.

```bash
# 노드 라벨 확인
kubectl get nodes myk8s-control-plane -o jsonpath='{.metadata.labels}' | jq

# Ingress-Nginx 배포
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# 배포 확인
kubectl get deploy,svc,ep ingress-nginx-controller -n ingress-nginx
kubectl describe -n ingress-nginx deployments/ingress-nginx-controller

```
**kind 전용 매니페스트 특징**:
- **hostPort 80/443 사용**: 호스트의 80, 443 포트를 직접 바인딩
- **nodeSelector**: `ingress-ready: "true"` 라벨이 있는 노드에만 배포
- **tolerations**: control-plane 노드의 taint 예외 처리

#### SSL Passthrough 활성화

ArgoCD의 자체 TLS를 사용하기 위해 **SSL Passthrough**를 활성화합니다.

```bash
# SSL Passthrough 옵션 확인
kubectl exec -it -n ingress-nginx deployments/ingress-nginx-controller -- \
  /nginx-ingress-controller --help | grep ssl

# Deployment 수정하여 --enable-ssl-passthrough 추가
KUBE_EDITOR="nano" kubectl edit -n ingress-nginx deployments/ingress-nginx-controller

# args 섹션에 추가
# - --enable-ssl-passthrough

```
**SSL Passthrough가 필요한 이유**:
- Ingress가 TLS를 종료하지 않고 **그대로 Pod에 전달**
- ArgoCD Server가 자체 TLS 인증서로 end-to-end HTTPS 유지
- 설정하지 않으면 "리디렉션 횟수가 너무 많습니다" 오류 발생

```mermaid
sequenceDiagram
    participant C as Client Browser
    participant I as Ingress Nginx
    participant A as ArgoCD Server
    participant S as Secret argocd-server-tls

    C->>I: HTTPS Request (argocd.example.com)
    Note over I: ssl-passthrough=true<br/>TLS 그대로 전달
    I->>A: Forward HTTPS (Passthrough)
    A->>S: Load TLS certificate + key
    A->>C: HTTPS Response (Self-Signed Cert)

```
#### IPTABLES 규칙 확인

```bash
# control-plane 노드(컨테이너)의 IPTABLES 규칙 확인
docker exec -it myk8s-control-plane bash
iptables -t nat -L -n -v | grep '10.244.0.7'
exit

# 출력 예시:
# 0 0 DNAT tcp -- * * 0.0.0.0/0 0.0.0.0/0 tcp dpt:80 to:10.244.0.7:80
# 0 0 DNAT tcp -- * * 0.0.0.0/0 0.0.0.0/0 tcp dpt:443 to:10.244.0.7:443

```
### 3. ArgoCD with TLS 설치

#### TLS 인증서 생성

**OpenSSL**로 self-signed 인증서를 생성합니다.

```bash
# TLS 키·인증서 생성
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout argocd.example.com.key \
  -out argocd.example.com.crt \
  -subj "/CN=argocd.example.com/O=argocd"

# 생성된 파일 확인
ls -l argocd.example.com.*

# 인증서 내용 확인
openssl x509 -noout -text -in argocd.example.com.crt
# Issuer: CN=argocd.example.com, O=argocd
# Validity: Not Before/After
# Subject: CN=argocd.example.com, O=argocd

```
#### ArgoCD TLS Secret 생성

```bash
# argocd 네임스페이스 생성
kubectl create ns argocd

# TLS Secret 생성
kubectl -n argocd create secret tls argocd-server-tls \
  --cert=argocd.example.com.crt \
  --key=argocd.example.com.key

# Secret 확인
kubectl get secret -n argocd argocd-server-tls
# NAME TYPE DATA AGE
# argocd-server-tls kubernetes.io/tls 2 7s

```
#### ArgoCD Helm 설치

```bash
# Helm values 파일 생성
cat <<EOF > argocd-values.yaml
global:
  domain: argocd.example.com

server:
  ingress:
    enabled: true
    ingressClassName: nginx
    annotations:
      nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
      nginx.ingress.kubernetes.io/ssl-passthrough: "true"
    tls: true
EOF

# ArgoCD 설치
helm repo add argo https://argoproj.github.io/argo-helm
helm install argocd argo/argo-cd --version 9.0.5 \
  -f argocd-values.yaml \
  --namespace argocd

# 배포 확인
kubectl get pod,ingress,svc,ep,secret,cm -n argocd
kubectl get ingress -n argocd argocd-server
# NAME CLASS HOSTS ADDRESS PORTS AGE
# argocd-server nginx argocd.example.com localhost 80, 443 6m42s

```
**ArgoCD TLS 동작 요약**:
1. cert-manager 없이 OpenSSL로 self-signed 인증서 생성
2. ArgoCD 서버는 `argocd-server-tls` Secret에서 TLS 인증서 로드
3. `server.ingress.tls=true` + `nginx.ingress.kubernetes.io/ssl-passthrough=true`
4. Ingress는 TLS를 종료하지 않고 Pod에 전달
5. 브라우저 → Ingress → ArgoCD Server까지 end-to-end HTTPS 유지

#### 도메인 설정 및 접속

```bash
# /etc/hosts 파일 수정 (macOS)
echo "127.0.0.1 argocd.example.com" | sudo tee -a /etc/hosts
cat /etc/hosts

# Windows: C:\Windows\System32\drivers\etc\hosts
# 127.0.0.1 argocd.example.com

# 접속 확인
curl -vk https://argocd.example.com/
kubectl -n ingress-nginx logs deploy/ingress-nginx-controller
kubectl -n argocd logs deploy/argocd-server

# 초기 관리자 암호 확인
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d; echo

# 웹 브라우저 접속
open "https://argocd.example.com"
# admin 계정 + 위에서 확인한 암호로 로그인

```
#### ArgoCD CLI 로그인

```bash
# CLI 로그인
argocd login argocd.example.com --insecure
# Username: admin
# Password: <초기 암호>

# 확인
argocd account list
argocd proj list
argocd repo list
argocd cluster list
argocd app list

```

---

## ArgoCD 접근 제어

### 1. 선언적 사용자 관리

#### 관리자 계정과 로컬 사용자

ArgoCD는 기본적으로 **admin 계정**을 제공하지만, 일상적인 작업을 위해 **최소 권한의 로컬 사용자**를 생성해야 합니다.

**로컬 사용자 alice 생성**:

```bash
# argocd-cm ConfigMap 수정
KUBE_EDITOR="nano" kubectl edit cm -n argocd argocd-cm

# data 섹션에 추가
# accounts.alice: apiKey, login

# ConfigMap 적용 후 계정 목록 확인
argocd account list
# NAME ENABLED CAPABILITIES
# admin false login
# alice true apiKey, login

```
**사용자 암호 설정**:

```bash
# alice 사용자 암호 설정
argocd account update-password --account alice
# Current password: <admin 암호>
# New password: <alice 암호>
# Confirm new password: <alice 암호>

# alice로 로그인 테스트
argocd logout
argocd login argocd.example.com --username alice --insecure

```
### 2. RBAC 권한 부여

#### RBAC 정책 구성

ArgoCD의 RBAC는 **argocd-rbac-cm** ConfigMap에서 관리합니다.

**정책 형식**:

```
p, <주체>, <리소스>, <동작>, <객체>, <효과>
g, <사용자/그룹>, <역할>

```
**RBAC 리소스 종류**:
- `applications`: Application 관리
- `clusters`: 클러스터 관리
- `repositories`: Git 저장소 관리
- `projects`: AppProject 관리
- `accounts`: 사용자 계정 관리
- `certificates`: 인증서 관리
- `logs`: 로그 조회
- `exec`: Pod 명령 실행

**RBAC 동작**:
- `get`: 조회
- `create`: 생성
- `update`: 수정
- `delete`: 삭제
- `sync`: 동기화
- `override`: 강제 동기화
- `action/*`: 모든 작업

#### RBAC 정책 예시

```bash
# argocd-rbac-cm ConfigMap 수정
KUBE_EDITOR="nano" kubectl edit cm -n argocd argocd-rbac-cm

# data 섹션에 추가
# policy.default: role:readonly
#
# policy.csv: |
# # alice 사용자에게 모든 애플리케이션에 대한 읽기 권한
# p, alice, applications, get, */*, allow
# p, alice, applications, sync, */*, allow
#
# # 특정 프로젝트에 대한 전체 권한
# p, alice, applications, *, default/*, allow

# ArgoCD Server 재시작
kubectl rollout restart deployment argocd-server -n argocd

```
### 3. 서비스 어카운트

#### 서비스 어카운트란?

**서비스 어카운트**는 CI/CD 파이프라인과 같은 자동화 시스템에 인증하는 데 사용하는 계정입니다.

**특징**:
- 사용자와 연결되어서는 안 됨 (파이프라인 실패 방지)
- 엄격하게 권한 제한 (최소 권한 원칙)
- API 키만 사용 (UI/CLI 로그인 불가)

#### 로컬 서비스 어카운트 생성

```bash
# argocd-cm ConfigMap 수정
KUBE_EDITOR="nano" kubectl edit cm -n argocd argocd-cm

# data 섹션에 추가
# accounts.gitops-ci: apiKey

# 계정 목록 확인
argocd account list
# NAME ENABLED CAPABILITIES
# admin false login
# alice true apiKey, login
# gitops-ci true apiKey

# API 키 생성
argocd account generate-token -a gitops-ci
# 생성된 토큰을 CI/CD 파이프라인에 저장

# 토큰 사용 예시
export ARGOCD_AUTH_TOKEN=<생성된 토큰>
argocd app list --auth-token $ARGOCD_AUTH_TOKEN

```
#### 서비스 어카운트 RBAC

```bash
# argocd-rbac-cm ConfigMap 수정
KUBE_EDITOR="nano" kubectl edit cm -n argocd argocd-rbac-cm

# data 섹션에 추가
# policy.csv: |
# # gitops-ci에게 특정 애플리케이션 sync 권한만 부여
# p, gitops-ci, applications, get, default/myapp, allow
# p, gitops-ci, applications, sync, default/myapp, allow
# p, gitops-ci, applications, create, */*, deny
# p, gitops-ci, applications, delete, */*, deny

# ArgoCD Server 재시작
kubectl rollout restart deployment argocd-server -n argocd

```

---

## Keycloak 소개

### 1. Keycloak이

**Keycloak**은 애플리케이션에 초점을 맞춘 오픈 소스 **ID 및 접근(권한) 관리 도구**입니다.

```mermaid
graph TB
    subgraph "Keycloak Features"
        AUTH[강력한 인증]
        SSO[Single Sign-On]
        SOCIAL[소셜 로그인]
        LDAP[LDAP/AD 통합]
        CUSTOM[사용자 정의]
    end

    subgraph "Applications"
        APP1[ArgoCD]
        APP2[GitLab]
        APP3[Grafana]
    end

    subgraph "Identity Providers"
        IDP1[Google]
        IDP2[GitHub]
        IDP3[LDAP]
    end

    SOCIAL --> IDP1
    SOCIAL --> IDP2
    LDAP --> IDP3

    AUTH --> APP1
    SSO --> APP1
    AUTH --> APP2
    SSO --> APP2
    AUTH --> APP3
    SSO --> APP3

```
### 2. 주요 기능 및 특징

#### 강력한 인증 기능

- 완전히 커스터마이징 가능한 로그인 페이지
- 암호 복구, 주기적인 암호 업데이트
- 이용 약관 동의, 2단계 인증
- 애플리케이션에 추가 코딩 불필요

#### Single Sign-On (SSO)

- 한 번의 인증으로 여러 애플리케이션 접근
- 세션 관리 기능
- 원격 세션 종료 가능
- 사용자/관리자 모두 세션 추적 가능

#### Identity Brokering

- 소셜 네트워크 로그인 (Google, GitHub, Facebook 등)
- 다른 엔터프라이즈 ID 공급자 연동
- 기존 사용자 데이터 통합

#### User Federation

- Active Directory 통합
- LDAP 서버 연동
- 기존 사용자 디렉터리 활용

#### 고가용성

- 가볍고 설치가 쉬운 솔루션
- 클러스터링 기능
- 여러 데이터 센터 지원

#### 확장성

- Custom 인증 메커니즘
- Custom 사용자 저장소
- Custom 토큰 연동
- Custom 로그인 프로토콜

### 3. 표준 프로토콜 지원

Keycloak은 업계 표준 프로토콜을 지원합니다:

| 프로토콜 | 설명 | 사용 사례 |
|---------|------|-----------|
| **OAuth 2.0** | 권한 부여 프레임워크 | API 접근 권한 |
| **OpenID Connect** | OAuth 2.0 기반 인증 | SSO, 사용자 인증 |
| **SAML 2.0** | 엔터프라이즈 SSO | 기업 환경 통합 |

**보안 토큰 방식**:
- 애플리케이션이 사용자 자격증명에 직접 접근하지 않음
- 필요한 항목에만 접근할 수 있는 토큰 제공
- 높은 수준의 보안 제공

---

## Keycloak 설치 및 구성

### 1. Keycloak Docker 배포

#### Docker로 Keycloak 실행

```bash
# Keycloak 컨테이너 실행
# 기본 관리자 계정: admin/admin
docker run -d \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  --net host \
  --name dev-keycloak \
  quay.io/keycloak/keycloak:22.0.0 start-dev

# 컨테이너 확인
docker ps
# CONTAINER ID IMAGE COMMAND PORTS
# db56c9925eff quay.io/keycloak/keycloak:22.0.0 "/opt/keycloak/bin/k…" 0.0.0.0:8080->8080/tcp

# 로그 확인
docker logs dev-keycloak
# INFO [org.keycloak.services] KC-SERVICES0050: Initializing master realm
# INFO [io.quarkus] Keycloak 22.0.0 on JVM (powered by Quarkus 3.2.0.Final) started in 4.856s
# INFO [org.keycloak.services] KC-SERVICES0009: Added user 'admin' to realm 'master'

```
#### Keycloak 접속

```bash
# Admin 콘솔 접속
open http://localhost:8080/admin
# 로그인: admin / admin

# 로그 모니터링
docker logs dev-keycloak -f

```
### 2. Realm 생성 및 설정

#### Realm이란?

**Realm**은 애플리케이션과 사용자를 위한 **영역(테넌트)**입니다.

- Realm은 다른 Realm과 완전히 **독립적**
- 각 Realm은 자체 **설정, 애플리케이션, 사용자** 보유
- Tenant라고 생각하면 됨

#### Realm 생성

1. **좌측 상단 모서리** (로고 왼쪽) 메뉴 아이콘 클릭하여 메뉴 확장
2. **Create Realm** 클릭
3. **Realm name**: `myrealm` (URL에 사용되므로 특수 문자 피하기)
4. **Create** 클릭
5. 왼쪽 메뉴 **Realm settings** 클릭 → **General** 탭
6. **Display name** 설정:
   ```html
   <div style="color: #007bff; font-weight: bold;">My Awesome Realm</div>
   ```
**Endpoint 확인**:
- OpenID Endpoint: `http://localhost:8080/realms/myrealm/.well-known/openid-configuration`
- SAML 2.0: `http://localhost:8080/realms/myrealm/protocol/saml/descriptor`

### 3. 사용자, 그룹, 역할 관리

#### User 생성

1. 왼쪽 메뉴 **Users** 클릭
2. **Add user** 클릭
3. 정보 입력:
   - **Username**: `keycloak`
   - **Email**: `keycloak@keycloak.org`
   - **First name**: `Ola`
   - **Last name**: `Nordmann`
4. **Create** 클릭
5. 생성된 User 클릭 → **Credentials** 탭
6. **Set password** 클릭
   - **Password**: (각자 설정)
   - **Temporary**: `Off` (ON일 경우 첫 로그인 시 비밀번호 변경 필요)
7. **Save** 클릭

#### Group 생성

1. 왼쪽 메뉴 **Groups** 클릭
2. **Create group** 클릭
3. **Name**: `mygroup`
4. **Create** 클릭

**Group의 역할**:
- 그룹에 **속성** 추가 가능 → 사용자가 상속
- 그룹에 **역할** 부여 가능 → 사용자가 상속

#### User를 Group에 추가

1. 왼쪽 메뉴 **Users** 클릭
2. 해당 User 클릭 → **Groups** 탭
3. **Join Group** 클릭
4. `mygroup` 선택 → **Join** 클릭

#### Global Role 생성

**Keycloak Role 구분**:
- **Realm Role**: Realm 전체에서 사용 가능한 역할
- **Client Role**: 특정 Client에서만 사용하는 역할
- **Composite Role**: 여러 역할을 조합한 역할

**Realm Role 생성**:

1. 왼쪽 메뉴 **Realm roles** 클릭
2. **Create role** 클릭
3. **Role name**: `myrole`
4. **Save** 클릭

**User에게 Role 할당**:

1. 왼쪽 메뉴 **Users** 클릭
2. 해당 User 클릭 → **Role mapping** 탭
3. **Assign role** 클릭
4. `myrole` 선택 → **Assign** 클릭

#### Keycloak Account Console

**Account Console**은 사용자가 자신의 계정을 관리할 수 있는 인터페이스입니다.

- 사용자 프로필 업데이트
- 패스워드 업데이트
- 2단계 인증 활성화
- 인증된 애플리케이션 보기
- 현재 세션 보기 및 원격 로그아웃

**접속**:

```bash
# Account Console 접속
open http://localhost:8080/realms/myrealm/account
# 로그인: keycloak / <설정한 암호>

```

---

## ArgoCD와 Keycloak SSO 연동

### 1. Client 생성

**Client**는 Keycloak에서 보호하려는 **애플리케이션**을 나타냅니다.

#### ArgoCD Client 생성

1. Admin Console → 왼쪽 메뉴 **Clients** 클릭
2. **Create client** 클릭
3. **General Settings**:
   - **Client type**: `OpenID Connect`
   - **Client ID**: `argocd`
4. **Next** 클릭
5. **Capability config**:
   - **Client authentication**: `On` (confidential client)
6. **Next** 클릭
7. **Login settings**:
   - **Root URL**: `https://argocd.example.com/`
   - **Home URL**: `/applications`
   - **Valid redirect URIs**: `https://argocd.example.com/auth/callback`
   - **Valid post logout redirect URIs**: `https://argocd.example.com/applications`
   - **Web origins**: `+` (자동으로 Valid redirect URIs 기반 설정)
8. **Save** 클릭

#### Client Secret 확인

1. 생성된 `argocd` Client 클릭
2. **Credentials** 탭 클릭
3. **Client secret** 복사 (예: `mV3IZO3nmHoZr3BBC37UpdrMSMkF9Umt`)

**메모해두기**: 이 시크릿은 ArgoCD 설정에 사용됩니다.

### 2. ArgoCD OIDC 설정

#### OpenID Connect Authorization Code Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as Application(ArgoCD)
    participant K as Keycloak

    U->>A: 1. 로그인 요청
    A->>U: 2. Keycloak으로 리디렉션
    U->>K: 3. 인증 요청
    K->>U: 4. 로그인 페이지 제공
    U->>K: 5. 자격증명 입력
    K->>U: 6. Authorization Code 발급
    U->>A: 7. Authorization Code 전달
    A->>K: 8. Token 요청 (Code 교환)
    K->>A: 9. ID Token + Access Token
    A->>U: 10. 인증 완료, 세션 생성

```
**흐름 설명**:
1. 사용자가 ArgoCD에 로그인 요청
2. ArgoCD는 인증 요청을 준비하고 Keycloak으로 리디렉션
3. 사용자가 Keycloak에 아직 인증되지 않았다면 로그인 페이지 제공
4. 사용자가 자격증명 입력
5. Keycloak이 Authorization Code 발급
6. ArgoCD가 Authorization Code를 ID Token과 Access Token으로 교환
7. ArgoCD는 ID Token으로 사용자 신원 확인 및 세션 설정

#### Client Secret 설정

```bash
# argocd-secret에 Client Secret 추가
kubectl -n argocd patch secret argocd-secret --patch='{"stringData": {
  "oidc.keycloak.clientSecret": "mV3IZO3nmHoZr3BBC37UpdrMSMkF9Umt"
}}'

# 확인
kubectl get secret -n argocd argocd-secret -o jsonpath='{.data}' | jq
# "oidc.keycloak.clientSecret": "bVYzSVpPM25tSG9acjNCQkMzN1VwZHJNU01rRjlVbXQ="

```
#### OIDC Config 추가

**중요**: `192.168.254.110`은 **자신의 로컬 IP**로 변경해야 합니다.
- Keycloak 컨테이너와 kind 클러스터(argocd-server 파드) 모두가 통신 가능해야 함

```bash
# 로컬 IP 확인 (macOS)
ifconfig | grep 192.

# argocd-cm ConfigMap 수정
KUBE_EDITOR="nano" kubectl edit cm -n argocd argocd-cm

# data 섹션에 추가
# url: https://argocd.example.com
#
# oidc.config: |
# name: Keycloak
# issuer: http://192.168.254.110:8080/realms/master
# clientID: argocd
# clientSecret: $oidc.keycloak.clientSecret
# requestedScopes: ["openid", "profile", "email"]

```
**설정 값 설명**:
- `name`: UI에 표시될 SSO 제공자 이름
- `issuer`: Keycloak Realm의 OIDC Discovery URL
- `clientID`: Keycloak에서 생성한 Client ID
- `clientSecret`: Secret에 저장된 값 참조
- `requestedScopes`: 요청할 사용자 정보 범위

#### ArgoCD Server 재시작

```bash
# ArgoCD Server 재시작 (ConfigMap 변경사항 적용)
kubectl rollout restart deploy argocd-server -n argocd

# 재시작 확인
kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server

```
### 3. Keycloak 인증 테스트

#### 웹 UI 로그인

```bash
# ArgoCD 웹 접속
open "https://argocd.example.com"

```
1. **로그인 페이지**에서 `LOG IN VIA KEYCLOAK` 버튼 클릭
2. Keycloak 로그인 페이지로 리디렉션
3. Keycloak 사용자 (`keycloak` / 암호) 입력
4. ArgoCD로 리디렉션되고 로그인 완료

#### 추가 사용자 생성 및 테스트

```bash
# Keycloak Admin Console에서 사용자 추가
# Username: tom
# Password: tom123

```
1. Keycloak Admin Console → Users → Add user
2. Username: `tom`, Email: `tom@example.com`
3. Credentials → Set password: `tom123`, Temporary: `Off`
4. ArgoCD에서 Keycloak 로그인 → `tom` / `tom123`

---

## OAuth 2.0과 OIDC 이해

### 1. OAuth 2.0 Authorization Code Flow

**OAuth 2.0**은 **권한 부여 프레임워크**입니다.

```mermaid
sequenceDiagram
    participant RO as Resource Owner<br/>(사용자)
    participant C as Client<br/>(애플리케이션)
    participant AS as Authorization Server<br/>(Keycloak)
    participant RS as Resource Server<br/>(API)

    RO->>C: 1. 게임 목록 보여줘
    C->>RO: 2. 인증이 필요합니다
    RO->>AS: 3. 로그인 및 권한 동의
    AS->>RO: 4. Authorization Code 발급
    RO->>C: 5. Authorization Code 전달
    C->>AS: 6. Token 요청 (Code + Client Secret)
    AS->>C: 7. Access Token 발급
    C->>RS: 8. API 요청 (Access Token)
    RS->>C: 9. 게임 목록 반환
    C->>RO: 10. 게임 목록 표시

```
**OAuth 2.0의 핵심**:
- **인증은 유저가 직접 수행**
- **권한은 클라이언트가 받는다**
- 사용자 자격증명을 애플리케이션에 노출하지 않음
- Access Token으로 제한된 권한만 부여

### 2. OIDC와 OAuth 2.0의 관계

**OpenID Connect (OIDC)**는 OAuth 2.0 위에 구축된 **인증 레이어**입니다.

| 구분 | OAuth 2.0 | OpenID Connect |
|------|-----------|----------------|
| **목적** | 권한 부여 (Authorization) | 인증 (Authentication) + 권한 부여 |
| **토큰** | Access Token | Access Token + **ID Token** |
| **사용 사례** | API 접근 권한 | SSO, 사용자 신원 확인 |
| **표준** | RFC 6749 | OpenID Connect Core 1.0 |

**OIDC의 추가 기능**:
- **ID Token**: 사용자 신원 정보를 담은 JWT
- **UserInfo Endpoint**: 사용자 프로필 정보 조회
- **Standard Claims**: 표준화된 사용자 정보 (name, email 등)

### 3. 토큰 종류와 역할

#### Access Token

**목적**: API 리소스 접근 권한

```
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

```
**특징**:
- 짧은 수명 (예: 5-15분)
- 리소스 서버가 검증
- Scope로 권한 제한

#### ID Token (OIDC)

**목적**: 사용자 신원 확인

```json
{
  "iss": "http://localhost:8080/realms/master",
  "sub": "f:12345678-1234-1234-1234-123456789abc:keycloak",
  "aud": "argocd",
  "exp": 1699999999,
  "iat": 1699999900,
  "email": "keycloak@keycloak.org",
  "name": "Ola Nordmann",
  "preferred_username": "keycloak",
  "groups": ["mygroup"]
}

```
**Claims 설명**:
- `iss` (Issuer): 토큰 발급자
- `sub` (Subject): 사용자 고유 ID
- `aud` (Audience): 토큰을 받을 대상 (Client ID)
- `exp` (Expiration): 만료 시간
- `email`, `name`: 사용자 정보
- `groups`: 사용자가 속한 그룹

#### Refresh Token

**목적**: Access Token 재발급

**특징**:
- 긴 수명 (예: 수일~수개월)
- 보안성 높은 저장 필요
- Access Token 만료 시 재발급 요청

---

**🎉 5주차 학습 완료!**

5주차에서는 ArgoCD의 **보안 및 인증**을 학습했습니다:
- **실습 환경 구성**: kind + Ingress-Nginx + ArgoCD with TLS
- **접근 제어**: 로컬 사용자, RBAC, 서비스 어카운트
- **Keycloak SSO**: Realm, User, Group, Role 관리
- **OIDC 연동**: ArgoCD와 Keycloak SSO 통합
- **OAuth 2.0 & OIDC**: 인증 및 권한 부여 프로토콜 이해

이제 **엔터프라이즈급 인증 및 권한 관리**를 구현할 수 있는 역량을 갖추게 되었습니다! 🚀

다음 단계에서는 멀티 클러스터 GitOps, 고급 보안 기능, 관찰성 등을 추가하여 프로덕션 수준의 플랫폼을 완성하는 것을 목표로 합니다.
