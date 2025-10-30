---
layout: post
title: "3주차 학습정리 - Jenkins CI/CD와 ArgoCD: GitOps 기반 쿠버네티스 배포 완전 정복"
date: 2025-10-28
categories: [학습정리, GitOps, Jenkins, ArgoCD, Kubernetes]
---

# 3주차 학습정리 - Jenkins CI/CD와 ArgoCD: GitOps 기반 쿠버네티스 배포 완전 정복

## 📋 목차

1. [🛠️ 실습 환경 구성](#️-실습-환경-구성)
   - [Jenkins와 Gogs 컨테이너 구성](#1-jenkins와-gogs-컨테이너-구성)
   - [Kind 로컬 쿠버네티스 클러스터](#2-kind-로컬-쿠버네티스-클러스터)
   - [Jenkins 초기 설정](#3-jenkins-초기-설정)
   - [Gogs Git 서버 설정](#4-gogs-git-서버-설정)

2. [🔧 Jenkins CI + K8S](#-jenkins-ci--k8s)
   - [Jenkins와 Kubernetes 통합](#1-jenkins와-kubernetes-통합)
   - [애플리케이션 배포 및 관리](#2-애플리케이션-배포-및-관리)
   - [Service와 Load Balancing](#3-service와-load-balancing)
   - [Gogs Webhook 연동](#4-gogs-webhook-연동)

3. [🚀 Jenkins CI/CD + Blue-Green 배포](#-jenkins-cicd--blue-green-배포)
   - [Blue-Green 배포 전략](#1-blue-green-배포-전략)
   - [Jenkins Pipeline으로 Blue-Green 구현](#2-jenkins-pipeline으로-blue-green-구현)

4. [🎯 ArgoCD GitOps 배포](#-argocd-gitops-배포)
   - [ArgoCD 소개 및 아키텍처](#1-argocd-소개-및-아키텍처)
   - [ArgoCD 설치 및 설정](#2-argocd-설치-및-설정)
   - [Helm Chart를 통한 배포](#3-helm-chart를-통한-배포)
   - [Full CI/CD 파이프라인 구축](#4-full-cicd-파이프라인-구축)

5. [🎨 Argo Rollouts - 고급 배포 전략](#-argo-rollouts---고급-배포-전략)
   - [Argo Rollouts 소개](#1-argo-rollouts-소개)
   - [Canary 배포 전략](#2-canary-배포-전략)

6. [📊 3주차 학습 정리](#-3주차-학습-정리)
   - [핵심 성취 목표](#1-핵심-성취-목표)
   - [실무 적용 포인트](#2-실무-적용-포인트)
   - [다음 단계 학습 방향](#3-다음-단계-학습-방향)

---

## 🛠️ 실습 환경 구성

### 1. Jenkins와 Gogs 컨테이너 구성

#### 전체 아키텍처

<div class="mermaid">
graph TB
    subgraph "로컬 개발 환경"
        DEV[개발자<br/>로컬 머신]
    end

    subgraph "Docker Compose 환경"
        JENKINS[Jenkins Container<br/>:8080, :50000]
        GOGS[Gogs Container<br/>:3000, :10022]

        JENKINS -.Docker-out-of-Docker.-> DOCKER[Host Docker]
    end

    subgraph "Kind 클러스터"
        K8S_MASTER[Control Plane<br/>myk8s-control-plane]
        K8S_WORKER1[Worker 1<br/>myk8s-worker]
        K8S_WORKER2[Worker 2<br/>myk8s-worker2]
    end

    DEV -->|Git Push| GOGS
    GOGS -->|Webhook| JENKINS
    JENKINS -->|Build Image| DOCKER
    JENKINS -->|Deploy| K8S_MASTER

    K8S_MASTER --> K8S_WORKER1
    K8S_MASTER --> K8S_WORKER2

    style JENKINS fill:#4ECDC4
    style GOGS fill:#95E1D3
    style K8S_MASTER fill:#F7DC6F
</div>

#### Docker Compose로 Jenkins와 Gogs 실행

```bash
# 작업 디렉토리 생성
mkdir cicd-labs && cd cicd-labs

# docker-compose.yaml 작성
cat << 'EOT' > docker-compose.yaml
services:
  jenkins:
    container_name: jenkins
    image: jenkins/jenkins
    restart: unless-stopped
    networks:
      - cicd-network
    ports:
      - "8080:8080"
      - "50000:50000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - jenkins_home:/var/jenkins_home

  gogs:
    container_name: gogs
    image: gogs/gogs
    restart: unless-stopped
    networks:
      - cicd-network
    ports:
      - "10022:22"
      - "3000:3000"
    volumes:
      - gogs-data:/data

volumes:
  jenkins_home:
  gogs-data:

networks:
  cicd-network:
    driver: bridge
EOT

# 컨테이너 시작
docker compose up -d

# 상태 확인
docker compose ps
```

#### Docker-out-of-Docker 설정

Jenkins 컨테이너 내부에서 호스트의 Docker 데몬을 사용하도록 설정합니다.

```bash
# Jenkins 컨테이너 접속 (root)
docker compose exec --privileged -u root jenkins bash

# Docker CLI 설치
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt install docker-ce-cli curl tree jq yq gh -y

# Jenkins 사용자에게 Docker 권한 부여
# macOS: docker 그룹 ID = 2000
# Windows WSL2: docker 그룹 ID = 1001 (cat /etc/group | grep docker)
groupadd -g 2000 docker  # macOS
chgrp docker /var/run/docker.sock
usermod -aG docker jenkins

exit

# Jenkins 컨테이너 재시작 (설정 적용)
docker compose restart jenkins

# jenkins 사용자로 docker 명령 실행 확인
docker compose exec jenkins docker ps
docker compose exec jenkins docker info
```

**Windows 사용자 참고**: WSL2 환경에서는 모든 docker compose 명령 앞에 `sudo`를 붙여야 합니다.

### 2. Kind 로컬 쿠버네티스 클러스터

#### Kind란?

**Kind**(Kubernetes IN Docker)는 Docker 컨테이너를 "노드"로 사용하여 로컬 쿠버네티스 클러스터를 실행하는 도구입니다.

<div class="mermaid">
graph TB
    subgraph "Host Machine"
        KIND[Kind Tool]

        subgraph "Docker Engine"
            CP[Control Plane<br/>Docker Container]
            W1[Worker 1<br/>Docker Container]
            W2[Worker 2<br/>Docker Container]
        end
    end

    KIND -->|Create Cluster| CP
    KIND -->|Create Cluster| W1
    KIND -->|Create Cluster| W2

    CP -->|Manages| W1
    CP -->|Manages| W2

    style KIND fill:#FF6B6B
    style CP fill:#F7DC6F
    style W1 fill:#98FB98
    style W2 fill:#98FB98
</div>

**Kind의 주요 특징**:
- Docker 컨테이너를 쿠버네티스 노드로 사용
- 멀티 노드 클러스터 지원
- kubeadm으로 클러스터 구성
- 빠른 클러스터 생성/삭제
- CI/CD 테스트에 최적화

#### Kind 설치 및 클러스터 생성

```bash
# macOS: Kind 설치
brew install kind
kind --version

# kubectl 설치
brew install kubernetes-cli
kubectl version --client --output=yaml

# Helm 설치
brew install helm
helm version

# (권장) 유용한 도구 설치
brew install krew          # kubectl 플러그인 관리자
brew install kube-ps1      # 프롬프트에 k8s 컨텍스트 표시
brew install kubectx       # 컨텍스트/네임스페이스 전환
brew install kubecolor     # kubectl 출력 컬러화
brew install stern         # 다중 Pod 로그 보기

# kubectl 단축키 및 kubecolor 설정
echo "alias kubectl=kubecolor" >> ~/.zshrc
echo "compdef kubecolor=kubectl" >> ~/.zshrc

# krew 플러그인 설치
kubectl krew install neat stern
```

#### 3노드 Kind 클러스터 배포

```bash
# 환경변수 설정
export KUBECONFIG=$PWD/kubeconfig

# 자신의 PC IP 확인 및 설정
MyIP=192.168.254.106  # 각자 자신의 IP로 변경

# Kind 클러스터 설정 파일 생성
cat << EOF > kind-3node.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  apiServerAddress: "$MyIP"
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000
    hostPort: 30000
  - containerPort: 30001
    hostPort: 30001
  - containerPort: 30002
    hostPort: 30002
  - containerPort: 30003
    hostPort: 30003
- role: worker
- role: worker
EOF

# 클러스터 생성
kind create cluster --config kind-3node.yaml --name myk8s --image kindest/node:v1.32.2

# 클러스터 확인
kind get clusters
kind get nodes --name myk8s

# 노드 정보 확인
kubectl get nodes -o wide
kubectl get pods -A -o wide

# Docker 네트워크 확인 (기본값: 172.18.0.0/16)
docker network ls | grep kind
docker network inspect kind

# 컨테이너 확인
docker ps | grep myk8s
```

#### kube-ops-view 설치

클러스터 상태를 시각적으로 확인할 수 있는 도구를 설치합니다.

```bash
# Helm 저장소 추가
helm repo add geek-cookbook https://geek-cookbook.github.io/charts/

# kube-ops-view 설치
helm install kube-ops-view geek-cookbook/kube-ops-view \
  --version 1.2.2 \
  --set service.main.type=NodePort,service.main.ports.http.nodePort=30001 \
  --set env.TZ="Asia/Seoul" \
  --namespace kube-system

# 설치 확인
kubectl get deploy,pod,svc,ep -n kube-system -l app.kubernetes.io/instance=kube-ops-view

# 웹 브라우저로 접속
open "http://127.0.0.1:30001/#scale=2"  # macOS
# Windows: http://127.0.0.1:30001/#scale=2
```

### 3. Jenkins 초기 설정

#### Jenkins 웹 접속 및 초기 설정

```bash
# Jenkins 초기 암호 확인
docker compose exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
# 출력: 09a21116f3ce4f27a0ede79372febfb1

# Jenkins 웹 접속
open "http://127.0.0.1:8080"  # macOS
# Windows: http://127.0.0.1:8080
```

**초기 설정 과정**:
1. 초기 암호 입력
2. "Install suggested plugins" 선택
3. 관리자 계정 생성: `admin` / `qwe123`
4. Jenkins URL 설정: `http://<자신의 PC IP>:8080`

#### Jenkins 플러그인 설치

**필수 플러그인**:
- **Pipeline Stage View**: 파이프라인 시각화
- **Docker Pipeline**: Docker 이미지 빌드 및 사용
- **Gogs**: Gogs Webhook 연동

**설치 방법**:
1. Jenkins 관리 → Plugins → Available plugins
2. 검색하여 선택 후 Install

#### Jenkins 자격증명 설정

**Jenkins 관리 → Credentials → Global → Add Credentials**

**1. Gogs 저장소 자격증명** (`gogs-crd`)
```
Kind: Username with password
Username: devops
Password: <Gogs 토큰>
ID: gogs-crd
```

**2. Docker Hub 자격증명** (`dockerhub-crd`)
```
Kind: Username with password
Username: <도커 계정명>
Password: <도커 계정 암호 또는 토큰>
ID: dockerhub-crd
```

**3. Kubernetes 자격증명** (`k8s-crd`)
```
Kind: Secret file
File: <kubeconfig 파일 업로드>
ID: k8s-crd
```

**Windows 사용자**: WSL2에서 `cat ~/.kube/config` 내용을 메모장으로 복사하여 파일로 저장 후 업로드

### 4. Gogs Git 서버 설정

#### Gogs 초기 설정

```bash
# Gogs 웹 접속
open "http://127.0.0.1:3000/install"  # macOS
# Windows: http://127.0.0.1:3000/install
```

**초기 설정**:
- 데이터베이스 유형: **SQLite3**
- 애플리케이션 URL: `http://<자신의 PC IP>:3000/`
- 기본 브랜치: **main**

**관리자 계정 설정**:
- 이름: `devops`
- 비밀번호: `qwe123`
- 이메일: `admin@example.com`

#### Gogs 토큰 발급

1. 로그인 후 → **Your Settings** → **Applications**
2. **Generate New Token** 클릭
3. Token Name: `devops`
4. **Generate Token** 클릭
5. 토큰 복사 및 저장 (예: `2cd5d237924f0082af2c44a2467c1dc69fccf943`)

#### Gogs 저장소 생성

**저장소 1: dev-app** (개발팀용)
```
Repository Name: dev-app
Visibility: Private
.gitignore: Python
Readme: Default
Initialize this repository with selected files and template: ✓
```

**저장소 2: ops-deploy** (데브옵스팀용)
```
Repository Name: ops-deploy
Visibility: Private
.gitignore: Python
Readme: Default
Initialize this repository with selected files and template: ✓
```

#### dev-app 저장소 초기 코드 작성

```bash
# Git 자격증명 설정
export TOKEN=2cd5d237924f0082af2c44a2467c1dc69fccf943  # 각자 토큰

# dev-app 저장소 클론
git clone http://devops:$TOKEN@192.168.254.124:3000/devops/dev-app.git
cd dev-app

# Git 설정
git config --local user.name "devops"
git config --local user.email "a@a.com"
git config --local init.defaultBranch main
git config --local credential.helper store

# server.py 파일 작성
cat << 'EOF' > server.py
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from datetime import datetime
import socket

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()

        now = datetime.now()
        hostname = socket.gethostname()

        response_string = now.strftime("The time is %-I:%M:%S %p, VERSION 0.0.1\n")
        response_string += f"Server hostname: {hostname}\n"

        self.wfile.write(bytes(response_string, "utf-8"))

def startServer():
    try:
        server = ThreadingHTTPServer(("0.0.0.0", 80), RequestHandler)
        print("Listening on " + ":".join(map(str, server.server_address)))
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

if __name__ == "__main__":
    startServer()
EOF

# Dockerfile 작성
cat << 'EOF' > Dockerfile
FROM python:3.12
ENV PYTHONUNBUFFERED 1
COPY . /app
WORKDIR /app
CMD python3 server.py
EOF

# VERSION 파일 생성
echo "0.0.1" > VERSION

# Git push
git add .
git commit -m "Add dev-app"
git push -u origin main
```

---

## 🔧 Jenkins CI + K8S

### 1. Jenkins와 Kubernetes 통합

#### Jenkins 컨테이너에 kubectl, helm 설치

```bash
# Jenkins 컨테이너 접속 (root)
docker compose exec --privileged -u root jenkins bash

# kubectl 설치
# macOS (ARM): arm64
# Windows: amd64
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl"
install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client --output=yaml

# Helm 설치
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version

exit

# 설치 확인
docker compose exec jenkins kubectl version --client --output=yaml
docker compose exec jenkins helm version
```

#### Jenkins Pipeline으로 Kubernetes 제어

**Jenkins Item 생성**: `k8s-cmd` (Pipeline)

```groovy
pipeline {
    agent any

    environment {
        KUBECONFIG = credentials('k8s-crd')
    }

    stages {
        stage('List Pods') {
            steps {
                sh 'kubectl get pods -A --kubeconfig $KUBECONFIG'
            }
        }
    }
}
```

### 2. 애플리케이션 배포 및 관리

#### Kubernetes 선언적 배포

쿠버네티스는 **선언적 구성(Declarative Configuration)**을 사용합니다. 원하는 상태를 YAML로 선언하면, 쿠버네티스가 해당 상태를 유지합니다.

<div class="mermaid">
sequenceDiagram
    participant User as 사용자
    participant K8s as Kubernetes API
    participant Controller as Controller
    participant Pod as Pod

    User->>K8s: 1. Deployment 선언<br/>(replicas: 2)
    K8s->>Controller: 2. 원하는 상태 전달
    Controller->>Pod: 3. Pod 2개 생성
    Pod->>Controller: 4. 상태 보고

    Note over Controller,Pod: Pod 1개 크래시 발생

    Pod->>Controller: 5. 현재 상태 1개
    Controller->>Controller: 6. 원하는 상태(2개)와 비교
    Controller->>Pod: 7. 새 Pod 1개 생성
    Pod->>Controller: 8. 상태 보고 (2개)
</div>

#### 애플리케이션 Deployment 배포

```bash
# Docker Hub 계정명 설정
export DHUSER=gasida  # 각자 계정명으로 변경

# Deployment 생성
cat << EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: timeserver
spec:
  replicas: 2
  selector:
    matchLabels:
      pod: timeserver-pod
  template:
    metadata:
      labels:
        pod: timeserver-pod
    spec:
      containers:
      - name: timeserver-container
        image: docker.io/$DHUSER/dev-app:0.0.1
EOF

# 배포 상태 확인
kubectl get deploy,rs,pod -o wide
watch -d kubectl get deploy,pod -o wide
```

#### 이미지 Pull 에러 해결

Private 이미지 저장소를 사용하는 경우 인증이 필요합니다.

```bash
# 에러 확인
kubectl describe pod <pod-name>
# Events:
#   Warning  Failed     Error: ImagePullBackOff
#   pull access denied, repository does not exist or may require authorization

# Docker Hub 자격증명 Secret 생성
export DHUSER=gasida       # 도커 계정
export DHPASS=<your-token> # 도커 토큰

kubectl create secret docker-registry dockerhub-secret \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=$DHUSER \
  --docker-password=$DHPASS

# Secret 확인
kubectl get secret dockerhub-secret
kubectl describe secret dockerhub-secret

# Deployment 업데이트 (imagePullSecrets 추가)
cat << EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: timeserver
spec:
  replicas: 2
  selector:
    matchLabels:
      pod: timeserver-pod
  template:
    metadata:
      labels:
        pod: timeserver-pod
    spec:
      containers:
      - name: timeserver-container
        image: docker.io/$DHUSER/dev-app:0.0.1
      imagePullSecrets:
      - name: dockerhub-secret
EOF

# 배포 확인
kubectl get deploy,rs,pod -o wide
```

### 3. Service와 Load Balancing

#### Service의 필요성

Pod는 생성/삭제 시마다 IP가 변경됩니다. Service는 Pod에 대한 **안정적인 네트워크 엔드포인트**를 제공합니다.

<div class="mermaid">
graph TB
    subgraph "Service"
        SVC[Service<br/>ClusterIP: 10.96.236.37<br/>NodePort: 30000]
    end

    subgraph "Pods (동적 IP)"
        POD1[Pod 1<br/>10.244.1.2]
        POD2[Pod 2<br/>10.244.2.2]
        POD3[Pod 3<br/>10.244.3.2]
    end

    CLIENT[Client] -->|고정 IP/도메인| SVC
    SVC -->|Load Balance| POD1
    SVC -->|Load Balance| POD2
    SVC -->|Load Balance| POD3

    POD1 -.크래시.-> DEAD[X]
    NEW[New Pod<br/>10.244.1.5] -.자동 추가.-> SVC

    style SVC fill:#4ECDC4
    style POD1 fill:#98FB98
    style POD2 fill:#98FB98
    style POD3 fill:#98FB98
    style NEW fill:#F7DC6F
</div>

**Service 주요 기능**:
- **고정 진입점**: ClusterIP, NodePort, LoadBalancer
- **로드 밸런싱**: Pod 간 트래픽 분산
- **서비스 디스커버리**: DNS 이름으로 접근 가능
- **헬스 체크**: 비정상 Pod는 자동 제외

#### Service 생성 및 테스트

```bash
# Service 생성
cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: timeserver
spec:
  selector:
    pod: timeserver-pod
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
    nodePort: 30000
  type: NodePort
EOF

# Service 확인
kubectl get svc,ep timeserver -o wide

# ClusterIP로 접속 테스트
kubectl run curl-pod --image=curlimages/curl:latest --command -- /bin/sh -c "while true; do sleep 3600; done"
kubectl exec -it curl-pod -- curl timeserver
kubectl exec -it curl-pod -- curl timeserver.default.svc.cluster.local

# NodePort로 접속 테스트
curl http://127.0.0.1:30000

# 부하분산 확인
for i in {1..100}; do curl -s http://127.0.0.1:30000 | grep hostname; done | sort | uniq -c | sort -nr
```

#### 애플리케이션 업데이트 (Rolling Update)

```bash
# dev-app 저장소에서 VERSION 0.0.2로 업데이트
cd ~/cicd-labs/dev-app

# VERSION 파일 수정
echo "0.0.2" > VERSION

# server.py 수정 (VERSION 0.0.1 → 0.0.2)
sed -i '' 's/VERSION 0.0.1/VERSION 0.0.2/g' server.py

# Git push
git add .
git commit -m "VERSION $(cat VERSION) Changed"
git push -u origin main

# Jenkins에서 이미지 빌드 후...

# Deployment 이미지 업데이트
kubectl set image deployment timeserver timeserver-container=$DHUSER/dev-app:0.0.2

# Rolling Update 과정 관찰
watch "kubectl get deploy,ep timeserver; echo; kubectl get rs,pod"

# 업데이트 결과 확인
kubectl get deploy timeserver
# NAME         READY   UP-TO-DATE   AVAILABLE   AGE
# timeserver   2/2     2            2           10m

curl http://127.0.0.1:30000
# VERSION 0.0.2 확인
```

**Rolling Update의 동작 원리**:
1. 새 ReplicaSet 생성
2. 새 Pod 하나씩 생성
3. 새 Pod가 Ready 상태가 되면
4. 기존 Pod 하나씩 종료
5. 모든 Pod가 교체될 때까지 반복

### 4. Gogs Webhook 연동

#### Gogs Webhook 설정

Gogs에서 코드 변경 시 Jenkins 빌드를 자동으로 트리거하도록 설정합니다.

**Gogs app.ini 파일 수정**:

```bash
# Gogs 컨테이너 접속
docker compose exec gogs bash

# app.ini 편집
vi /data/gogs/conf/app.ini

# [security] 섹션에 추가
[security]
INSTALL_LOCK = true
SECRET_KEY = j2xaUPQcbAEwpIu
LOCAL_NETWORK_ALLOWLIST = 192.168.254.124  # 각자 PC IP

exit

# Gogs 재시작
docker compose restart gogs
```

**Webhook 추가** (Gogs 웹):
1. dev-app 저장소 → Settings → Webhooks → Add Webhook → Gogs
2. **Payload URL**: `http://192.168.254.124:8080/gogs-webhook/?job=SCM-Pipeline`
3. **Content Type**: `application/json`
4. **Secret**: `qwe123`
5. **When should this webhook be triggered?**: Just the push event
6. **Active**: ✓

#### Jenkins Pipeline with SCM

**Jenkins Item**: `SCM-Pipeline` (Pipeline from SCM)

**Pipeline 설정**:
- **GitHub project**: `http://<PC IP>:3000/devops/dev-app`
- **Build Triggers**: ✓ Build when a change is pushed to Gogs
- **Use Gogs secret**: `qwe123`
- **SCM**: Git
  - Repository URL: `http://<PC IP>:3000/devops/dev-app`
  - Credentials: `devops/***`
  - Branch: `*/main`
  - Script Path: `Jenkinsfile`

**Jenkinsfile** 작성:

```groovy
pipeline {
    agent any

    environment {
        DOCKER_IMAGE = '<도커계정>/dev-app'  // 각자 수정
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'http://192.168.254.124:3000/devops/dev-app.git',
                    credentialsId: 'gogs-crd'
            }
        }

        stage('Read VERSION') {
            steps {
                script {
                    def version = readFile('VERSION').trim()
                    echo "Version found: ${version}"
                    env.DOCKER_TAG = version
                }
            }
        }

        stage('Docker Build and Push') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-crd') {
                        def appImage = docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                        appImage.push()
                        appImage.push("latest")
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Docker image ${DOCKER_IMAGE}:${DOCKER_TAG} has been built and pushed successfully!"
        }
        failure {
            echo "Pipeline failed. Please check the logs."
        }
    }
}
```

**테스트**:

```bash
# Jenkinsfile 생성 및 push
cd ~/cicd-labs/dev-app
touch Jenkinsfile
# 위 내용 작성

git add Jenkinsfile
git commit -m "Add Jenkinsfile"
git push

# Gogs Webhook 기록 확인
# Jenkins 빌드 자동 트리거 확인
# Docker Hub에 이미지 업로드 확인
```

---

## 🚀 Jenkins CI/CD + Blue-Green 배포

### 1. Blue-Green 배포 전략

#### Blue-Green 배포란?

Blue-Green 배포는 두 개의 동일한 프로덕션 환경(Blue, Green)을 유지하여 **무중단 배포**와 **빠른 롤백**을 가능하게 하는 전략입니다.

<div class="mermaid">
graph TB
    subgraph "1단계: Blue 환경 운영 중"
        USER1[사용자] -->|트래픽| SERVICE1[Service<br/>selector: blue]
        SERVICE1 --> BLUE1[Blue<br/>Deployment<br/>v1.0]
        GREEN1[Green<br/>Deployment<br/>v2.0]

        style SERVICE1 fill:#4ECDC4
        style BLUE1 fill:#87CEEB
        style GREEN1 fill:#90EE90,stroke-dasharray: 5 5
    end

    subgraph "2단계: Green 환경 배포 및 테스트"
        USER2[사용자] -->|트래픽| SERVICE2[Service<br/>selector: blue]
        SERVICE2 --> BLUE2[Blue<br/>Deployment<br/>v1.0]
        GREEN2[Green<br/>Deployment<br/>v2.0]
        TEST[테스터] -.내부 테스트.-> GREEN2

        style SERVICE2 fill:#4ECDC4
        style BLUE2 fill:#87CEEB
        style GREEN2 fill:#90EE90
    end

    subgraph "3단계: 트래픽 전환"
        USER3[사용자] -->|트래픽| SERVICE3[Service<br/>selector: green]
        SERVICE3 --> GREEN3[Green<br/>Deployment<br/>v2.0]
        BLUE3[Blue<br/>Deployment<br/>v1.0]

        style SERVICE3 fill:#4ECDC4
        style GREEN3 fill:#90EE90
        style BLUE3 fill:#87CEEB,stroke-dasharray: 5 5
    end
</div>

**Blue-Green 배포 장점**:
- ✅ **무중단 배포**: 서비스 다운타임 없음
- ✅ **빠른 롤백**: Service selector만 변경하면 즉시 롤백
- ✅ **안전한 테스트**: 프로덕션 트래픽 전환 전 테스트 가능
- ✅ **위험 최소화**: 문제 발생 시 즉시 이전 버전으로 복구

**Blue-Green 배포 단점**:
- ❌ **리소스 2배**: 동일한 환경 2개 유지 필요
- ❌ **데이터베이스 호환성**: DB 스키마 변경 시 양쪽 호환 필요
- ❌ **복잡성**: 환경 관리 복잡도 증가

### 2. Jenkins Pipeline으로 Blue-Green 구현

#### echo-server Deployment 준비

```bash
# dev-app 저장소에 deploy 디렉토리 생성
cd ~/cicd-labs/dev-app
mkdir deploy

# Blue Deployment
cat << 'EOF' > deploy/echo-server-blue.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-server-blue
spec:
  replicas: 2
  selector:
    matchLabels:
      app: echo-server
      version: blue
  template:
    metadata:
      labels:
        app: echo-server
        version: blue
    spec:
      containers:
      - name: echo-server
        image: hashicorp/http-echo
        args:
        - "-text=Hello from Blue"
        ports:
        - containerPort: 5678
EOF

# Service (초기에는 Blue를 가리킴)
cat << 'EOF' > deploy/echo-server-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: echo-server-service
spec:
  selector:
    app: echo-server
    version: blue
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5678
    nodePort: 30000
  type: NodePort
EOF

# Green Deployment
cat << 'EOF' > deploy/echo-server-green.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: echo-server-green
spec:
  replicas: 2
  selector:
    matchLabels:
      app: echo-server
      version: green
  template:
    metadata:
      labels:
        app: echo-server
        version: green
    spec:
      containers:
      - name: echo-server
        image: hashicorp/http-echo
        args:
        - "-text=Hello from Green"
        ports:
        - containerPort: 5678
EOF

# Git push
git add deploy/
git commit -m "Add echo server yaml"
git push
```

#### Blue-Green Pipeline 생성

**Jenkins Item**: `k8s-bluegreen` (Pipeline)

```groovy
pipeline {
    agent any

    environment {
        KUBECONFIG = credentials('k8s-crd')
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'http://192.168.254.124:3000/devops/dev-app.git',
                    credentialsId: 'gogs-crd'
            }
        }

        stage('Deploy Blue Version') {
            steps {
                sh "kubectl apply -f ./deploy/echo-server-blue.yaml --kubeconfig $KUBECONFIG"
                sh "kubectl apply -f ./deploy/echo-server-service.yaml --kubeconfig $KUBECONFIG"
            }
        }

        stage('Approve Green Version') {
            steps {
                input message: 'Deploy Green version?', ok: "Yes"
            }
        }

        stage('Deploy Green Version') {
            steps {
                sh "kubectl apply -f ./deploy/echo-server-green.yaml --kubeconfig $KUBECONFIG"
            }
        }

        stage('Approve Version Switching') {
            steps {
                script {
                    input message: 'Switch to Green?', ok: "Yes"
                    sh "kubectl patch svc echo-server-service -p '{\"spec\": {\"selector\": {\"version\": \"green\"}}}' --kubeconfig $KUBECONFIG"
                }
            }
        }

        stage('Blue Rollback or Remove') {
            steps {
                script {
                    def action = input message: 'Blue Rollback or Remove?',
                                      parameters: [choice(choices: ['done', 'rollback'], name: 'ACTION')]

                    if (action == "rollback") {
                        sh "kubectl patch svc echo-server-service -p '{\"spec\": {\"selector\": {\"version\": \"blue\"}}}' --kubeconfig $KUBECONFIG"
                    } else {
                        sh "kubectl delete -f ./deploy/echo-server-blue.yaml --kubeconfig $KUBECONFIG"
                    }
                }
            }
        }
    }
}
```

#### Blue-Green 배포 테스트

```bash
# 접속 모니터링 (별도 터미널)
while true; do curl -s --connect-timeout 1 http://127.0.0.1:30000; echo; date; echo "------------"; sleep 1; done

# 배포 상태 모니터링 (별도 터미널)
watch -d 'kubectl get deploy -o wide; echo; kubectl get svc,ep echo-server-service -o wide; echo "------------"'

# Jenkins에서 k8s-bluegreen 파이프라인 실행
# 1. Blue 버전 배포 → Hello from Blue 확인
# 2. Green 버전 배포 승인
# 3. Green으로 전환 승인 → Hello from Green 확인
# 4. Blue 제거 또는 롤백 선택
```

---

## 🎯 ArgoCD GitOps 배포

### 1. ArgoCD 소개 및 아키텍처

#### ArgoCD란?

**ArgoCD**는 쿠버네티스를 위한 **선언적 GitOps 지속적 배포(CD) 도구**입니다.

> Argo CD is a declarative, GitOps continuous delivery tool for Kubernetes.

**ArgoCD 핵심 철학**:
- Application definitions, configurations, and environments should be **declarative** and **version controlled**
- Application deployment and lifecycle management should be **automated**, **auditable**, and **easy to understand**

#### ArgoCD 아키텍처

<div class="mermaid">
graph TB
    subgraph "GitOps Flow"
        GIT[Git Repository<br/>Desired State]

        subgraph "ArgoCD Components"
            API[API Server<br/>Web UI, gRPC/REST]
            REPO[Repository Server<br/>Git 연결 및<br/>Manifest 생성]
            CTRL[Application Controller<br/>리소스 모니터링<br/>Drift 감지]
            REDIS[Redis<br/>캐싱]
        end

        K8S[Kubernetes Cluster<br/>Live State]
    end

    GIT -.Pull.-> REPO
    REPO -.Manifest.-> CTRL
    CTRL <-.Monitor.-> K8S
    CTRL -.Sync.-> K8S

    API -->|관리| CTRL
    API -->|요청| REPO
    REDIS -->|캐시| REPO
    REDIS -->|캐시| CTRL

    USER[개발자/운영자] -->|웹 UI/CLI| API

    style GIT fill:#FF6B6B
    style API fill:#4ECDC4
    style CTRL fill:#F7DC6F
    style K8S fill:#98FB98
</div>

**ArgoCD 주요 컴포넌트**:

| 컴포넌트 | 역할 |
|---------|------|
| **API Server** | Web UI 대시보드, gRPC/REST API 제공, 인증 및 권한 관리 |
| **Repository Server** | Git 연결, Kubernetes Manifest 생성 (Kustomize, Helm 등 지원) |
| **Application Controller** | 쿠버네티스 리소스 모니터링, Git과 비교하여 OutOfSync 감지 및 자동 동기화 |
| **Redis** | Kubernetes API와 Git 요청 줄이기 위한 캐싱 |
| **Dex** (Optional) | 외부 인증 연동 (OIDC, LDAP, SAML 등) |
| **Notification** (Optional) | 이벤트 알림 및 트리거 |
| **ApplicationSet Controller** (Optional) | 멀티 클러스터를 위한 App 패키징 |

#### ArgoCD GitOps 루프

<div class="mermaid">
flowchart TB
    START[시작] --> DEPLOY[1. 배포 Deploy<br/>Git Manifest를 클러스터에 배포]

    DEPLOY --> MONITOR[2. 모니터링 Monitor<br/>Git 저장소 및 클러스터 상태 감시]

    MONITOR --> DETECT[3. 변화 감지 Detect Drift<br/>Git vs 실제 클러스터 차이 감지]

    DETECT --> DRIFT{드리프트<br/>발견?}

    DRIFT -->|예| ACTION[4. 반영 Take Action<br/>Git 상태로 클러스터 복구]
    DRIFT -->|아니오| MONITOR

    ACTION --> DEPLOY

    style DEPLOY fill:#FFB6C1
    style MONITOR fill:#98FB98
    style DETECT fill:#87CEEB
    style ACTION fill:#F7DC6F
</div>

**GitOps 루프 상세 설명**:

1. **Deploy**: Git 저장소에 정의된 Manifest를 쿠버네티스 클러스터에 배포
2. **Monitor**:
   - Git 저장소 변경사항 주기적 확인 (기본 3분)
   - 클러스터 리소스 상태 실시간 모니터링
3. **Detect Drift**: Git의 원하는 상태와 클러스터의 실제 상태 비교
4. **Take Action**: 차이(Drift)가 발견되면 자동으로 Git 상태로 복구

#### ArgoCD 핵심 개념

| 개념 | 설명 |
|-----|------|
| **Application** | Git 저장소의 Manifest로 정의된 쿠버네티스 리소스 그룹 (CRD) |
| **Application Source Type** | Manifest 생성 도구 (Kustomize, Helm, Jsonnet, Plain YAML) |
| **Target State** | Git 저장소에 정의된 원하는 상태 |
| **Live State** | 클러스터에 실제 배포된 상태 |
| **Sync Status** | Target State와 Live State의 일치 여부 |
| **Sync** | 애플리케이션을 Target State로 만드는 프로세스 |
| **Refresh** | Git의 최신 코드와 Live State 비교 |
| **Health** | 애플리케이션이 정상 동작 중인지 여부 |

### 2. ArgoCD 설치 및 설정

#### Helm으로 ArgoCD 설치

```bash
# argocd 네임스페이스 생성
kubectl create ns argocd

# Helm values 파일 작성
cat << 'EOF' > argocd-values.yaml
dex:
  enabled: false

server:
  service:
    type: NodePort
    nodePortHttps: 30002
EOF

# Helm 저장소 추가
helm repo add argo https://argoproj.github.io/argo-helm

# ArgoCD 설치
helm install argocd argo/argo-cd \
  --version 7.7.10 \
  -f argocd-values.yaml \
  --namespace argocd

# 설치 확인
kubectl get pod,svc,ep -n argocd
kubectl get crd | grep argo
```

#### ArgoCD 초기 암호 확인 및 접속

```bash
# 초기 admin 암호 확인
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
# 출력: PCdOlwZT8c4naBWK

# ArgoCD 웹 접속
open "https://127.0.0.1:30002"  # macOS
# Windows: https://127.0.0.1:30002

# 로그인
# Username: admin
# Password: PCdOlwZT8c4naBWK
```

**초기 설정**:
1. User Info → **UPDATE PASSWORD**로 암호 변경 (`qwe12345`)
2. Settings → Repositories → **CONNECT REPO** 클릭

#### ops-deploy Repository 등록

**Repository 설정**:
```
Connection method: VIA HTTPS
Type: git
Project: default
Repo URL: http://192.168.254.124:3000/devops/ops-deploy
Username: devops
Password: <Gogs 토큰>
```

### 3. Helm Chart를 통한 배포

#### nginx-chart 준비 (ops-deploy 저장소)

```bash
# ops-deploy 저장소 클론
cd ~/cicd-labs
git clone http://devops:$TOKEN@192.168.254.124:3000/devops/ops-deploy.git
cd ops-deploy

# Git 설정
git config --local user.name "devops"
git config --local user.email "a@a.com"
git config --local init.defaultBranch main
git config --local credential.helper store

# nginx-chart 디렉토리 생성
export VERSION=1.26.1
mkdir -p nginx-chart/templates

# VERSION 파일
echo "$VERSION" > nginx-chart/VERSION

# Chart.yaml
cat << EOF > nginx-chart/Chart.yaml
apiVersion: v2
name: nginx-chart
description: A Helm chart for deploying Nginx with custom index.html
type: application
version: 1.0.0
appVersion: "$VERSION"
EOF

# templates/configmap.yaml
cat << 'EOF' > nginx-chart/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}
data:
  index.html: |
{{ .Values.indexHtml | indent 4 }}
EOF

# templates/deployment.yaml
cat << 'EOF' > nginx-chart/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
      - name: nginx
        image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
        ports:
        - containerPort: 80
        volumeMounts:
        - name: index-html
          mountPath: /usr/share/nginx/html/index.html
          subPath: index.html
      volumes:
      - name: index-html
        configMap:
          name: {{ .Release.Name }}
EOF

# templates/service.yaml
cat << 'EOF' > nginx-chart/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
    nodePort: 30000
  type: NodePort
EOF

# values-dev.yaml (개발 환경)
cat << EOF > nginx-chart/values-dev.yaml
indexHtml: |
  <!DOCTYPE html>
  <html>
  <head>
    <title>Welcome to Nginx!</title>
  </head>
  <body>
    <h1>Hello, Kubernetes!</h1>
    <p>DEV: Nginx version $VERSION</p>
  </body>
  </html>

image:
  repository: nginx
  tag: $VERSION

replicaCount: 1
EOF

# values-prd.yaml (프로덕션 환경)
cat << EOF > nginx-chart/values-prd.yaml
indexHtml: |
  <!DOCTYPE html>
  <html>
  <head>
    <title>Welcome to Nginx!</title>
  </head>
  <body>
    <h1>Hello, Kubernetes!</h1>
    <p>PRD: Nginx version $VERSION</p>
  </body>
  </html>

image:
  repository: nginx
  tag: $VERSION

replicaCount: 2
EOF

# Git push
git add nginx-chart/
git commit -m "Add nginx helm chart"
git push
```

#### ArgoCD Application 생성 (선언적 방식)

```bash
# dev-nginx Application 생성
cat << 'EOF' | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: dev-nginx
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    helm:
      valueFiles:
      - values-dev.yaml
    path: nginx-chart
    repoURL: http://192.168.254.124:3000/devops/ops-deploy
    targetRevision: HEAD
  syncPolicy:
    automated:
      prune: true
    syncOptions:
    - CreateNamespace=true
  destination:
    namespace: dev-nginx
    server: https://kubernetes.default.svc
EOF

# Application 확인
kubectl get applications -n argocd
kubectl describe applications -n argocd dev-nginx

# 배포 확인
kubectl get all -n dev-nginx -o wide
curl http://127.0.0.1:30000
```

#### 자동 동기화 동작 확인

```bash
# ops-deploy 저장소에서 VERSION 업데이트
cd ~/cicd-labs/ops-deploy
export VERSION=1.26.2

# VERSION 파일 업데이트
echo "$VERSION" > nginx-chart/VERSION

# values-dev.yaml 업데이트
cat << EOF > nginx-chart/values-dev.yaml
indexHtml: |
  <!DOCTYPE html>
  <html>
  <head>
    <title>Welcome to Nginx!</title>
  </head>
  <body>
    <h1>Hello, Kubernetes!</h1>
    <p>DEV: Nginx version $VERSION</p>
  </body>
  </html>

image:
  repository: nginx
  tag: $VERSION

replicaCount: 2
EOF

# Chart.yaml appVersion 업데이트
sed -i '' "s/appVersion: .*/appVersion: \"$VERSION\"/" nginx-chart/Chart.yaml

# Git push
git add .
git commit -m "Update nginx version $(cat nginx-chart/VERSION)"
git push

# ArgoCD에서 자동 동기화 확인 (최대 3분)
# ArgoCD 웹에서 REFRESH 클릭으로 즉시 확인 가능
kubectl get all -n dev-nginx -o wide
curl http://127.0.0.1:30000
```

**ArgoCD 동기화 주기 설정**:

ArgoCD는 기본적으로 **3분마다** Git 저장소를 확인합니다.

```bash
# 동기화 주기 확인
kubectl get cm argocd-cm -n argocd -o yaml | grep timeout.reconciliation
# timeout.reconciliation: 180s

# 즉시 동기화: ArgoCD 웹에서 REFRESH 클릭
```

### 4. Full CI/CD 파이프라인 구축

#### 전체 CI/CD 플로우

<div class="mermaid">
sequenceDiagram
    participant Dev as 개발자
    participant DevRepo as dev-app Repo
    participant Jenkins as Jenkins CI
    participant Registry as Docker Hub
    participant OpsRepo as ops-deploy Repo
    participant ArgoCD as ArgoCD
    participant K8s as Kubernetes

    Dev->>DevRepo: 1. 코드 수정 및 Push<br/>(VERSION, server.py)
    DevRepo->>Jenkins: 2. Webhook 트리거
    Jenkins->>Jenkins: 3. 이미지 빌드
    Jenkins->>Registry: 4. 이미지 Push<br/>(v0.0.4)
    Jenkins->>OpsRepo: 5. Manifest 업데이트<br/>(timeserver.yaml)
    OpsRepo->>ArgoCD: 6. 변경 감지 (3분 이내)
    ArgoCD->>K8s: 7. 새 버전 배포<br/>(v0.0.4)
    K8s->>Dev: 8. 배포 완료 확인

    Note over Dev,K8s: 개발자는 dev-app만 관리,<br/>나머지는 자동화
</div>

**Full CI/CD 특징**:
- **개발팀**: `dev-app` 저장소만 관리 (코드, Dockerfile, VERSION)
- **Jenkins**: 이미지 빌드 후 `ops-deploy` 저장소 자동 업데이트
- **ArgoCD**: `ops-deploy` 저장소 변경 감지 및 자동 배포
- **완전 자동화**: 코드 커밋부터 배포까지 수동 작업 없음

#### ops-deploy Repo에 dev-app Manifest 추가

```bash
# ops-deploy 저장소에 dev-app 디렉토리 생성
cd ~/cicd-labs/ops-deploy
mkdir dev-app

export DHUSER=gasida  # 각자 도커 계정
export VERSION=0.0.3

# VERSION 파일
echo "$VERSION" > dev-app/VERSION

# timeserver.yaml
cat << EOF > dev-app/timeserver.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: timeserver
spec:
  replicas: 2
  selector:
    matchLabels:
      pod: timeserver-pod
  template:
    metadata:
      labels:
        pod: timeserver-pod
    spec:
      containers:
      - name: timeserver-container
        image: docker.io/$DHUSER/dev-app:$VERSION
      imagePullSecrets:
      - name: dockerhub-secret
EOF

# service.yaml
cat << 'EOF' > dev-app/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: timeserver
spec:
  selector:
    pod: timeserver-pod
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
    nodePort: 30000
  type: NodePort
EOF

# Git push
git add dev-app/
git commit -m "Add dev-app deployment yaml"
git push
```

#### ArgoCD Application 생성 (timeserver)

```bash
cat << 'EOF' | kubectl apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: timeserver
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    path: dev-app
    repoURL: http://192.168.254.124:3000/devops/ops-deploy
    targetRevision: HEAD
  syncPolicy:
    automated:
      prune: true
    syncOptions:
    - CreateNamespace=true
  destination:
    namespace: default
    server: https://kubernetes.default.svc
EOF

# 배포 확인
kubectl get applications -n argocd timeserver
kubectl get deploy,rs,pod
kubectl get svc,ep timeserver
curl http://127.0.0.1:30000
```

#### Jenkinsfile 수정 (ops-deploy 자동 업데이트)

```bash
# dev-app 저장소의 Jenkinsfile 수정
cd ~/cicd-labs/dev-app

cat << 'EOF' > Jenkinsfile
pipeline {
    agent any

    environment {
        DOCKER_IMAGE = 'gasida/dev-app'  // 각자 도커 계정으로 변경
        GOGSCRD = credentials('gogs-crd')
    }

    stages {
        stage('dev-app Checkout') {
            steps {
                git branch: 'main',
                    url: 'http://192.168.254.124:3000/devops/dev-app.git',
                    credentialsId: 'gogs-crd'
            }
        }

        stage('Read VERSION') {
            steps {
                script {
                    def version = readFile('VERSION').trim()
                    echo "Version found: ${version}"
                    env.DOCKER_TAG = version
                }
            }
        }

        stage('Docker Build and Push') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-crd') {
                        def appImage = docker.build("${DOCKER_IMAGE}:${DOCKER_TAG}")
                        appImage.push()
                        appImage.push("latest")
                    }
                }
            }
        }

        stage('ops-deploy Checkout') {
            steps {
                git branch: 'main',
                    url: 'http://192.168.254.124:3000/devops/ops-deploy.git',
                    credentialsId: 'gogs-crd'
            }
        }

        stage('ops-deploy Version Update') {
            steps {
                sh '''
                    OLDVER=$(cat dev-app/VERSION)
                    NEWVER=$(echo ${DOCKER_TAG})

                    sed -i -e "s/$OLDVER/$NEWVER/g" dev-app/timeserver.yaml
                    sed -i -e "s/$OLDVER/$NEWVER/g" dev-app/VERSION

                    git add ./dev-app
                    git config user.name "devops"
                    git config user.email "a@a.com"
                    git commit -m "version update ${DOCKER_TAG}"
                    git push http://${GOGSCRD_USR}:${GOGSCRD_PSW}@192.168.254.124:3000/devops/ops-deploy.git
                '''
            }
        }
    }

    post {
        success {
            echo "Docker image ${DOCKER_IMAGE}:${DOCKER_TAG} has been built and pushed successfully!"
        }
        failure {
            echo "Pipeline failed. Please check the logs."
        }
    }
}
EOF

# Git push
git add Jenkinsfile
git commit -m "Update Jenkinsfile for ops-deploy automation"
git push
```

#### Full CI/CD 테스트

```bash
# dev-app 저장소에서 VERSION 업데이트
cd ~/cicd-labs/dev-app

# VERSION 0.0.4로 업데이트
echo "0.0.4" > VERSION

# server.py 업데이트
sed -i '' 's/VERSION 0.0.3/VERSION 0.0.4/g' server.py

# Git push
git add .
git commit -m "VERSION $(cat VERSION) Changed"
git push

# Jenkins 자동 빌드 확인
# ops-deploy 저장소 자동 업데이트 확인
# ArgoCD 자동 배포 확인 (3분 이내)
curl http://127.0.0.1:30000
```

---

## 🎨 Argo Rollouts - 고급 배포 전략

### 1. Argo Rollouts 소개

**Argo Rollouts**는 쿠버네티스를 위한 **Progressive Delivery Controller**입니다.

**기본 RollingUpdate의 한계**:
- ❌ 롤아웃 속도 제어 부족
- ❌ 새 버전으로의 트래픽 제어 불가
- ❌ 외부 메트릭 기반 자동 롤백 불가
- ❌ 심층 테스트 및 분석 기능 부족

**Argo Rollouts가 제공하는 기능**:
- ✅ **Blue-Green** 배포 전략
- ✅ **Canary** 배포 전략 (세밀한 가중치 트래픽 분배)
- ✅ **자동 롤백 및 프로모션**
- ✅ **수동 승인(Manual Judgement)**
- ✅ **메트릭 기반 분석** (Prometheus, Datadog 등)
- ✅ **Ingress 컨트롤러 통합** (NGINX, ALB 등)
- ✅ **Service Mesh 통합** (Istio, Linkerd 등)

#### Argo Rollouts 아키텍처

<div class="mermaid">
graph TB
    subgraph "Argo Rollouts"
        CTRL[Rollouts Controller]
        ROLLOUT[Rollout Resource<br/>배포 전략 정의]

        CTRL -->|관리| ROLLOUT
    end

    subgraph "Kubernetes"
        RS_OLD[ReplicaSet<br/>Old Version]
        RS_NEW[ReplicaSet<br/>New Version]
        SVC[Service]
        INGRESS[Ingress/<br/>Service Mesh]
    end

    subgraph "분석"
        ANALYSIS[AnalysisTemplate<br/>분석 정의]
        METRICS[Metric Providers<br/>Prometheus 등]

        ANALYSIS -->|쿼리| METRICS
    end

    ROLLOUT -->|생성| RS_OLD
    ROLLOUT -->|생성| RS_NEW
    ROLLOUT -->|트래픽 제어| INGRESS
    INGRESS --> SVC
    SVC --> RS_OLD
    SVC --> RS_NEW

    ROLLOUT -->|트리거| ANALYSIS
    ANALYSIS -->|성공/실패| ROLLOUT

    style CTRL fill:#4ECDC4
    style ROLLOUT fill:#F7DC6F
    style ANALYSIS fill:#FF6B6B
</div>

### 2. Canary 배포 전략

#### Canary 배포란?

**Canary 배포**는 새 버전을 소수의 사용자에게 먼저 배포하여 테스트한 후, 점진적으로 트래픽을 늘려가는 배포 전략입니다.

<div class="mermaid">
graph TB
    subgraph "1단계: 10% Canary"
        USER1[사용자 100%] --> SVC1[Service]
        SVC1 -->|90%| STABLE1[Stable<br/>v1.0]
        SVC1 -->|10%| CANARY1[Canary<br/>v2.0]

        style STABLE1 fill:#87CEEB
        style CANARY1 fill:#FFB6C1
    end

    subgraph "2단계: 50% Canary"
        USER2[사용자 100%] --> SVC2[Service]
        SVC2 -->|50%| STABLE2[Stable<br/>v1.0]
        SVC2 -->|50%| CANARY2[Canary<br/>v2.0]

        style STABLE2 fill:#87CEEB
        style CANARY2 fill:#FFB6C1
    end

    subgraph "3단계: 100% New Version"
        USER3[사용자 100%] --> SVC3[Service]
        SVC3 -->|100%| NEW[New Stable<br/>v2.0]

        style NEW fill:#90EE90
    end
</div>

**Canary 배포 장점**:
- ✅ **위험 최소화**: 소수 사용자에게 먼저 배포
- ✅ **점진적 확대**: 문제 없으면 트래픽 증가
- ✅ **빠른 롤백**: 문제 발견 시 즉시 중단
- ✅ **실제 사용자 테스트**: A/B 테스트 가능

#### Argo Rollouts 설치

```bash
# argo-rollouts 네임스페이스 생성
kubectl create ns argo-rollouts

# Helm values 파일
cat << 'EOF' > argorollouts-values.yaml
dashboard:
  enabled: true
  service:
    type: NodePort
    nodePort: 30003
EOF

# Argo Rollouts 설치
helm install argo-rollouts argo/argo-rollouts \
  --version 2.35.1 \
  -f argorollouts-values.yaml \
  --namespace argo-rollouts

# 설치 확인
kubectl get all -n argo-rollouts

# 대시보드 접속
echo "http://127.0.0.1:30003"
open "http://127.0.0.1:30003"
```

#### Canary Rollout 예제

```bash
# Rollout 리소스 배포
kubectl apply -f https://raw.githubusercontent.com/argoproj/argo-rollouts/master/docs/getting-started/basic/rollout.yaml
kubectl apply -f https://raw.githubusercontent.com/argoproj/argo-rollouts/master/docs/getting-started/basic/service.yaml

# Rollout 확인
kubectl get rollout rollouts-demo
kubectl describe rollout rollouts-demo

# Pod 확인
kubectl get pod -l app=rollouts-demo
kubectl get svc,ep rollouts-demo

# 현재 이미지 확인
kubectl get rollouts rollouts-demo -o json | grep -A 2 "image"
# "image": "argoproj/rollouts-demo:blue"
```

**Rollout Spec 분석**:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: rollouts-demo
spec:
  replicas: 5
  strategy:
    canary:              # Canary 전략
      steps:
      - setWeight: 20    # 20% 트래픽
      - pause: {}        # 수동 승인 대기
      - setWeight: 40    # 40% 트래픽
      - pause: {duration: 10s}  # 10초 대기
      - setWeight: 60    # 60% 트래픽
      - pause: {duration: 10s}
      - setWeight: 80    # 80% 트래픽
      - pause: {duration: 10s}
  # ... (나머지 생략)
```

#### Rollout 업데이트 및 진행 제어

```bash
# 새 버전으로 이미지 업데이트
kubectl set image rollout rollouts-demo rollouts-demo=argoproj/rollouts-demo:yellow

# Rollout 상태 확인
kubectl get rollout rollouts-demo
kubectl argo rollouts get rollout rollouts-demo --watch

# 수동 프로모션 (다음 단계 진행)
kubectl argo rollouts promote rollouts-demo

# 롤백
kubectl argo rollouts undo rollouts-demo

# 전체 롤백
kubectl argo rollouts abort rollouts-demo
```

**Argo Rollouts 대시보드**에서 시각적으로 Canary 배포 진행 상황을 확인할 수 있습니다:
- 각 ReplicaSet의 Pod 수
- 트래픽 가중치
- 분석 결과

---

## 📊 3주차 학습 정리

### 1. 핵심 성취 목표

**Jenkins CI/CD 마스터**
- ✅ Jenkins와 Kubernetes 통합
- ✅ Docker-out-of-Docker 설정
- ✅ Pipeline as Code (Jenkinsfile)
- ✅ Gogs Webhook 연동
- ✅ Blue-Green 배포 구현

**ArgoCD GitOps 배포**
- ✅ GitOps 철학 이해 및 실습
- ✅ ArgoCD 아키텍처 이해
- ✅ Helm Chart 기반 배포
- ✅ 선언적 Application 관리
- ✅ 자동 동기화 및 Drift 감지

**Argo Rollouts**
- ✅ Progressive Delivery 개념 이해
- ✅ Canary 배포 전략 실습
- ✅ 수동 승인 및 자동 프로모션

**Full CI/CD 파이프라인**
- ✅ 개발 저장소(dev-app)와 운영 저장소(ops-deploy) 분리
- ✅ Jenkins CI → ArgoCD CD 통합
- ✅ 완전 자동화된 배포 플로우 구축

### 2. 실무 적용 포인트

#### GitOps 저장소 전략

<div class="mermaid">
graph LR
    subgraph "개발팀"
        DEV_REPO[dev-app<br/>코드, Dockerfile]
    end

    subgraph "데브옵스팀"
        OPS_REPO[ops-deploy<br/>K8s Manifest]
    end

    subgraph "자동화"
        JENKINS[Jenkins CI]
        ARGOCD[ArgoCD]
    end

    DEV_REPO -->|Webhook| JENKINS
    JENKINS -->|이미지 빌드| REGISTRY[Docker Hub]
    JENKINS -->|Manifest 업데이트| OPS_REPO
    OPS_REPO -->|GitOps| ARGOCD
    ARGOCD -->|배포| K8S[Kubernetes]

    style DEV_REPO fill:#FFB6C1
    style OPS_REPO fill:#98FB98
    style JENKINS fill:#4ECDC4
    style ARGOCD fill:#F7DC6F
</div>

**저장소 분리의 이점**:
- **책임 분리**: 개발팀은 코드, 데브옵스팀은 인프라
- **보안**: 개발팀은 프로덕션 클러스터 접근 불필요
- **감사 추적**: 각 저장소별 변경 이력 명확
- **유연성**: 동일 이미지를 다양한 환경에 배포 가능

#### 배포 전략 선택 가이드

| 전략 | 다운타임 | 리소스 | 롤백 속도 | 적합한 경우 |
|-----|---------|--------|-----------|------------|
| **Rolling Update** | 없음 | 1배 | 느림 (재배포) | 대부분의 일반적인 배포 |
| **Blue-Green** | 없음 | 2배 | 매우 빠름 | 빠른 롤백이 중요한 경우 |
| **Canary** | 없음 | 1.1~1.5배 | 빠름 (트래픽 전환) | 점진적 검증이 필요한 경우 |
| **Recreate** | 있음 | 1배 | 빠름 | 개발 환경, 다운타임 허용 |

#### ArgoCD 활용 팁

**1. App of Apps 패턴**

여러 애플리케이션을 하나의 App으로 관리:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: app-of-apps
spec:
  source:
    path: apps/  # 여러 Application YAML 포함
  syncPolicy:
    automated:
      prune: true
```

**2. ApplicationSet으로 멀티 클러스터 관리**

동일한 애플리케이션을 여러 클러스터에 배포:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: timeserver-all-clusters
spec:
  generators:
  - list:
      elements:
      - cluster: dev
        url: https://dev-cluster
      - cluster: prod
        url: https://prod-cluster
  template:
    # Application 템플릿
```

**3. Webhook으로 즉시 동기화**

ArgoCD Webhook 설정으로 Git push 시 즉시 동기화:

```bash
# Gogs에서 Webhook 추가
# Payload URL: https://<argocd-server>/api/webhook
# Secret: <argocd-webhook-secret>
```

### 3. 다음 단계 학습 방향

**Jenkins 심화**
- Shared Libraries로 코드 재사용
- JenkinsX로 클라우드 네이티브 CI/CD
- Multi-branch Pipeline
- Blue Ocean UI

**ArgoCD 심화**
- RBAC 및 멀티테넌시
- Sync Waves와 Hooks
- ApplicationSet Controller
- Notifications 설정

**Argo Rollouts 심화**
- AnalysisTemplate으로 메트릭 기반 자동 롤백
- Ingress 컨트롤러 통합 (NGINX, Istio)
- Flagger와 비교

**전체 GitOps 플랫폼**
- Tekton + ArgoCD 조합
- Flux vs ArgoCD 비교
- GitHub Actions + ArgoCD
- Kubernetes Operators 개발

### 4. 주요 명령어 치트시트

#### Kind 명령어

```bash
# 클러스터 생성/삭제
kind create cluster --config kind-3node.yaml --name myk8s
kind delete cluster --name myk8s
kind get clusters

# 이미지 로드 (로컬 이미지를 Kind 클러스터로)
kind load docker-image myapp:latest --name myk8s
```

#### ArgoCD CLI

```bash
# 로그인
argocd login 127.0.0.1:30002

# Application 관리
argocd app list
argocd app get timeserver
argocd app sync timeserver
argocd app diff timeserver
argocd app history timeserver
argocd app rollback timeserver <revision>

# Repository 관리
argocd repo list
argocd repo add <repo-url>
```

#### Argo Rollouts CLI

```bash
# Rollout 관리
kubectl argo rollouts list rollouts
kubectl argo rollouts get rollout rollouts-demo
kubectl argo rollouts get rollout rollouts-demo --watch

# 배포 제어
kubectl argo rollouts promote rollouts-demo
kubectl argo rollouts undo rollouts-demo
kubectl argo rollouts abort rollouts-demo
kubectl argo rollouts restart rollouts-demo

# 대시보드
kubectl argo rollouts dashboard
```

---

**🎉 3주차 학습 완료!**

이번 주차에서는 Jenkins CI/CD와 ArgoCD를 활용한 완전한 GitOps 파이프라인을 구축했습니다. 개발 저장소와 운영 저장소를 분리하여 책임을 명확히 하고, ArgoCD의 자동 동기화로 운영 부담을 크게 줄일 수 있었습니다. Argo Rollouts를 통해 안전한 배포 전략도 실습했습니다.

다음 단계에서는 이러한 개념들을 실제 프로덕션 환경에 적용하고, 모니터링과 로깅을 추가하여 완전한 관측 가능성(Observability)을 확보하는 것이 목표입니다!
