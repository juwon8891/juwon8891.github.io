---
tags:
  - Istio
  - Security
  - mTLS
---

# Istio - 마이크로서비스 통신 보안(Security)

> Istio의 mTLS 자동화, PeerAuthentication, AuthorizationPolicy를 활용한 서비스 메시 보안 구성을 정리한다.

마이크로서비스 환경에서 서비스 간 통신 보안을 구현하는 방법을 다룹니다. Istio가 제공하는 mTLS(Mutual TLS), JWT 기반 최종 사용자 인증, AuthorizationPolicy를 통해 "기본적으로 안전한" 서비스 메시를 구축하는 원리와 실습을 정리한다.

스터디 실습 환경: **docker** (**kind** - `k8s 1.23.17`), `istio 1.17.8`

## 1. 애플리케이션 네트워크 보안의 필요성

마이크로서비스 아키텍처에서는 서비스 간 통신이 네트워크를 통해 이루어지므로, 보안이 매우 중요한다. 애플리케이션 보안은 인증받지 않은 사용자가 중요한 데이터에 접근하거나 변조하는 것을 방지하는 모든 행동을 포함한다.

## 1.1 애플리케이션 보안의 핵심 요소

애플리케이션 보안을 위해서는 다음 세 가지 핵심 요소가 필요한다:

- **인증(Authentication)**: 자신의 정체를 입증하는 절차로, 패스워드, 인증서, 생체 인식 등을 사용한다.
- **인가(Authorization)**: 이미 인증된 사용자가 특정 작업을 수행할 수 있는지 허용하거나 거부하는 절차이다.
- **전송 중 데이터 암호화**: 데이터가 네트워크를 통해 전송되는 동안 도청을 방지한다.

## 1.2 서비스 간 인증

안전한 마이크로서비스 환경에서는 모든 서비스가 상호작용하는 다른 서비스를 인증해야 한다. 이는 확인 가능한 ID 문서를 통해 이루어지며, 이 문서는 신뢰할 수 있는 제3자에 의해 검증된다.

Istio는 SPIFFE(Secure Production Identity Framework for Everyone) 프레임워크를 사용하여 서비스 ID 발급을 자동화한다. SPIFFE는 고도로 동적이고 이질적인 환경에서 워크로드에 ID를 제공하기 위한 오픈소스 표준이다.

## 1.3 최종 사용자 인증

최종 사용자 인증은 개인 데이터를 저장하는 애플리케이션에서 필수적이다. 일반적으로 사용자는 인증 서버에서 로그인한 후 자격 증명(HTTP 쿠키, JWT 등)을 받아 서비스에 제시한다. 서비스는 이 자격 증명을 발급한 인증 서버에 검증한 후 접근을 허용한다.

## 1.4 인가

인가는 인증된 호출자가 어떤 작업을 수행할 수 있는지 결정하는 과정이다. 호출자의 ID를 확인한 후, 서버는 이 ID가 특정 작업을 수행할 권한이 있는지 확인하고 승인하거나 거부한다.

Istio는 서비스 인증과 ID 모델을 기반으로 서비스 간 또는 최종 사용자와 서비스 간의 세분화된 인가 기능을 제공한다.

## 1.5 모놀리스와 마이크로서비스의 보안 비교

모놀리스와 마이크로서비스 모두 최종 사용자 및 서비스 간 인증과 인가를 구현해야 하지만, 마이크로서비스에는 보호해야 할 네트워크 연결과 요청이 훨씬 더 많다.

모놀리스는 일반적으로 정적인 인프라에서 실행되어 IP 주소를 ID 확인의 근거로 사용할 수 있다. 반면, 마이크로서비스는 동적 환경에서 실행되어 IP 주소가 자주 변경되므로 ID의 근거로 사용하기 어렵다.

또한, 마이크로서비스는 여러 클라우드 프로바이더나 온프레미스 환경에 걸쳐 실행될 수 있어 더 복잡한 ID 관리가 필요한다. Istio는 이러한 문제를 해결하기 위해 SPIFFE 사양을 사용한다.

![모놀리스와 마이크로서비스 비교](https://istio.io/latest/docs/concepts/security/microservice-comparison.svg)
*출처: Istio 공식 문서*

## 1.6 Istio가 SPIFFE를 구현하는 방법

SPIFFE ID는 RFC 3986 호환 URI로, `spiffe://trust-domain/path` 형식으로 구성된다:

- `trust-domain`: ID 발급자(개인 또는 조직)를 나타냅니다.
- `path`: trust-domain 내에서 워크로드를 유일하게 식별한다.

Istio에서는 path를 워크로드의 서비스 어카운트로 채웁니다. SPIFFE ID는 SVID(SPIFFE Verifiable Identity Document)라고도 하는 X.509 인증서로 인코딩되며, Istio의 컨트롤 플레인이 각 워크로드마다 생성한다.

이 인증서는 서비스 간 통신에서 전송 데이터를 암호화하는 데 사용된다.

## 1.7 Istio 보안 요약

Istio 보안은 다음 세 가지 주요 리소스를 통해 구현된다:

1. **PeerAuthentication**: 서비스 간 트래픽을 인증하도록 프록시를 설정한다. 인증에 성공하면, 프록시는 상대 peer의 인증서에서 정보를 추출하여 요청 인가에 사용한다.

2. **RequestAuthentication**: 프록시가 최종 사용자의 자격 증명을 발급 서버에 확인해 인증하도록 설정한다. 인증에 성공하면, 자격 증명에서 정보를 추출하여 요청 인가에 사용한다.

3. **AuthorizationPolicy**: 앞선 두 리소스에서 추출한 정보를 토대로 프록시가 요청을 인가하거나 거부하도록 구성한다.

![Istio 보안 아키텍처](https://istio.io/latest/docs/concepts/security/arch-sec.svg)
*출처: Istio 공식 문서*

## 2. 자동 상호 TLS (Auto mTLS)

## 2.1 자동 상호 TLS의 중요성

마이크로서비스 환경에서는 서비스 간 통신이 안전하게 이루어져야 한다. Istio는 사이드카 프록시가 주입된 서비스 간의 트래픽을 기본적으로 암호화하고 인증한다.

인증서 발급 및 갱신 절차를 자동화하는 것은 매우 중요한다. 과거에는 수동 관리로 인한 오류가 서비스 중단을 초래했지만, Istio의 자동화된 접근 방식은 이러한 문제를 방지한다.

## 2.2 TLS vs mTLS

- **TLS**: 네트워크 통신에서 도청, 간섭, 위조를 방지하기 위한 암호화 프로토콜이다. 서버 인증과 데이터 암호화를 제공한다.

- **mTLS(Mutual TLS)**: 일반 TLS의 확장으로, 서버뿐만 아니라 클라이언트도 인증서를 통해 인증한다. 양방향 인증을 통해 더 높은 보안 수준을 제공한다.

![TLS vs mTLS](https://velog.velcdn.com/images/juwon8891/post/2b5077c8-8d12-4cdf-bfde-42c55d106612/image.png)

## 2.3 PeerAuthentication 리소스 이해하기

PeerAuthentication 리소스를 사용하면 워크로드가 mTLS를 엄격하게 요구하거나 평문 트래픽을 허용하도록 설정할 수 있다. 다음과 같은 인증 모드를 지원한다:

- **STRICT**: 상호 인증된 트래픽만 허용한다.
- **PERMISSIVE**: 암호화된 요청과 평문 요청을 모두 허용한다.
- **UNSET**: 부모의 PeerAuthentication 정책을 상속한다.
- **DISABLE**: 트래픽을 터널링하지 않고 직접 서비스로 전송한다.

PeerAuthentication 정책은 다양한 범위에 적용할 수 있다:

- **메시 범위(Mesh-wide)**: 서비스 메시의 모든 워크로드에 적용된다.
- **네임스페이스 범위(Namespace-wide)**: 특정 네임스페이스 내 모든 워크로드에 적용된다.
- **워크로드별(Workload-specific)**: 특정 셀렉터에 부합하는 워크로드에만 적용된다.

![PeerAuthentication 정책 범위](blob:https://velog.io/df0c5e57-af19-4b43-9f30-bba012b29e21)

## 2.4 메시 범위 정책으로 모든 미인증 트래픽 거부하기

메시의 보안을 향상시키기 위해 STRICT 상호 인증 모드를 강제하는 메시 범위 정책을 만들어 평문 트래픽을 금지할 수 있다. 메시 범위 PeerAuthentication 정책은 Istio를 설치한 네임스페이스에 적용해야 하며, 이름은 'default'여야 한다.

```yaml
apiVersion: "security.istio.io/v1beta1"
kind: "PeerAuthentication"
metadata:
  name: "default"  # Mesh-wide policies must be named "default"
  namespace: "istio-system"  # Istio installation namespace
spec:
  mtls:
    mode: STRICT  # mutual TLS mode
```

## 실습: 자동 상호 TLS 설정 및 테스트

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
  - containerPort: 30000 # istio-ingressgateway HTTP
    hostPort: 30000
  - containerPort: 30005 # istio-ingressgateway HTTPS
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
# catalog 앱 배포
kubectl apply -f services/catalog/kubernetes/catalog.yaml -n istioinaction

# webapp 앱 배포
kubectl apply -f services/webapp/kubernetes/webapp.yaml -n istioinaction

# gateway, virtualservice 설정
kubectl apply -f services/webapp/istio/webapp-catalog-gw-vs.yaml -n istioinaction

# default 네임스페이스에 sleep 앱 배포 (레거시 워크로드)
kubectl apply -f ch9/sleep.yaml -n default

# 확인
kubectl get deploy,pod,sa,svc,ep
kubectl get deploy,svc -n istioinaction
kubectl get gw,vs -n istioinaction
```

### 3. 기본 통신 확인

레거시 sleep 워크로드에서 webapp 워크로드로 평문 요청을 실행한다:

```bash
# 요청 실행
kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"

# 반복 요청
watch 'kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"'
```

![](https://velog.velcdn.com/images/juwon8891/post/46e94aa2-0463-4636-a71f-797b185e69e4/image.png)

Kiali에서 확인하면 sleep → webapp 구간은 평문 통신임을 확인할 수 있다.

### 4. 메시 범위 STRICT 정책 적용

```bash
# 메시 범위 STRICT 정책 적용
cat <<EOF | kubectl apply -f -
apiVersion: "security.istio.io/v1beta1"
kind: "PeerAuthentication"
metadata:
  name: "default"
  namespace: "istio-system"
spec:
  mtls:
    mode: STRICT
EOF

# 정책 확인
kubectl get peerauthentication -n istio-system

# 요청 테스트 (실패)
kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"
```

![](https://velog.velcdn.com/images/juwon8891/post/1b415aff-ca6a-49e6-867d-1198b6a2bbf5/image.png)

STRICT 모드에서는 레거시 워크로드(sleep)에서의 평문 요청이 거부된다.

### 5. 네임스페이스 범위 PERMISSIVE 정책 적용

```bash
# 네임스페이스 범위 PERMISSIVE 정책 적용
cat <<EOF | kubectl apply -f -
apiVersion: "security.istio.io/v1beta1"
kind: "PeerAuthentication"
metadata:
  name: "default"
  namespace: "istioinaction"
spec:
  mtls:
    mode: PERMISSIVE
EOF

# 정책 확인
kubectl get peerauthentication -A

# 요청 테스트 (성공)
kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"
```

![](https://velog.velcdn.com/images/juwon8891/post/530d8e02-e629-4ecf-b101-da9a7517b953/image.png)

네임스페이스 범위 PERMISSIVE 정책은 메시 범위 정책을 덮어쓰므로, 평문 요청이 다시 허용된다.

### 6. 워크로드별 정책 적용

```bash
# 네임스페이스 정책 삭제
kubectl delete peerauthentication default -n istioinaction

# webapp에만 PERMISSIVE 정책 적용
cat <<EOF | kubectl apply -f -
apiVersion: "security.istio.io/v1beta1"
kind: "PeerAuthentication"
metadata:
  name: "webapp"
  namespace: "istioinaction"
spec:
  selector:
    matchLabels:
      app: "webapp"
  mtls:
    mode: PERMISSIVE
EOF

# 정책 확인
kubectl get peerauthentication -A

# webapp 요청 테스트 (성공)
kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"

# catalog 직접 요청 테스트 (실패)
kubectl exec deploy/sleep -c sleep -- curl -s catalog.istioinaction/api/items -o /dev/null -w "%{http_code}\n"
```

![](https://velog.velcdn.com/images/juwon8891/post/6c3770fd-ca03-41ae-9ce9-08d692d00130/image.png)

이제 webapp은 평문 요청을 허용하지만, catalog는 여전히 STRICT 모드로 평문 요청을 거부한다.

## 2.7 서비스 간 트래픽 암호화 확인하기

tcpdump와 같은 도구를 사용하여 서비스 간 트래픽이 실제로 암호화되는지 확인할 수 있다. Istio 프록시에는 기본적으로 tcpdump가 설치되어 있어 네트워크 인터페이스를 통과하는 트래픽을 분석할 수 있다.

```bash
# 패킷 모니터링 실행
kubectl exec -it -n istioinaction deploy/webapp -c istio-proxy \
  -- sudo tcpdump -l --immediate-mode -vv -s 0 '(((ip[2:2] - ((ip[0]&0xf)<<2)) - ((tcp[12]&0xf0)>>2)) != 0)'

# 요청 실행
kubectl exec deploy/sleep -c sleep -- curl -s webapp.istioinaction/api/catalog -o /dev/null -w "%{http_code}\n"
```

![](https://velog.velcdn.com/images/juwon8891/post/847c7d8b-2641-4567-bbb3-64c0ab8a139c/image.png)

실행 결과 예시:
```
14:07:24.926390 IP 10-10-0-16.sleep.default.svc.cluster.local.32828 > webapp-7685bcb84-hp2kl.http-alt: Flags [P.], cksum 0x14bc (incorrect -> 0xa83b), seq 2741788650:2741788744, ack 3116297176, win 512, options [nop,nop,TS val 490217013 ecr 2804101520], length 94: HTTP, length: 94 GET /api/catalog HTTP/1.1 Host: webapp.istioinaction User-Agent: curl/8.5.0 Accept: */*

14:07:24.931647 IP webapp-7685bcb84-hp2kl.37882 > 10-10-0-19.catalog.istioinaction.svc.cluster.local.3000: Flags [P.], cksum 0x1945 (incorrect -> 0x9667), seq 2146266072:2146267324, ack 260381029, win 871, options [nop,nop,TS val 1103915113 ecr 4058175976], length 1252
```

위 결과에서 볼 수 있듯이:
1. sleep → webapp 호출은 HTTP(평문)로 이루어집니다.
2. webapp → catalog 호출은 HTTPS(암호화)로 이루어집니다.

## 2.8 워크로드 ID 확인하기

openssl 명령어를 사용하여 워크로드의 X.509 인증서 내용을 확인할 수 있다. 이를 통해 발급된 인증서가 유효한 SVID 문서인지, SPIFFE ID가 인코딩되어 있는지, 그리고 그 ID가 워크로드 서비스 어카운트와 일치하는지 확인할 수 있다.

```bash
# 인증서 내용 확인
kubectl -n istioinaction exec deploy/webapp -c istio-proxy \
  -- openssl s_client -showcerts \
  -connect catalog.istioinaction.svc.cluster.local:80 \
  -CAfile /var/run/secrets/istio/root-cert.pem | \
  openssl x509 -in /dev/stdin -text -noout
```

인증서에서 다음과 같은 정보를 확인할 수 있다:
- 유효 기간
- 사용처(웹 서버, 웹 클라이언트 등)
- SPIFFE ID(예: `URI:spiffe://cluster.local/ns/istioinaction/sa/catalog`)

또한 openssl verify 명령어로 인증 기관(CA) 루트 인증서에 대해 서명을 확인함으로써 X.509 SVID의 내용이 유효한지 확인할 수 있다:

```bash
# webapp.istio-proxy 쉘 접속
kubectl -n istioinaction exec -it deploy/webapp -c istio-proxy -- /bin/bash

# 인증서 검증
openssl verify -CAfile /var/run/secrets/istio/root-cert.pem \
  <(openssl s_client -connect \
  catalog.istioinaction.svc.cluster.local:80 -showcerts 2>/dev/null)
```

## 3. 서비스 간 트래픽 인가하기

인증이 "당신이 누구인가?"를 확인하는 것이라면, 인가는 "당신이 무엇을 할 수 있는가?"를 결정하는 것이다. Istio의 AuthorizationPolicy 리소스를 사용하면 서비스 간 트래픽에 대한 세밀한 접근 제어를 구현할 수 있다.

## 3.1 AuthorizationPolicy 리소스 이해하기

AuthorizationPolicy는 다음과 같은 요소로 구성된다:

- **selector**: 정책이 적용될 워크로드를 지정한다.
- **action**: ALLOW, DENY, AUDIT, CUSTOM 중 하나를 지정한다.
- **rules**: 언제 action이 적용될지 결정하는 조건을 지정한다.
  - **from**: 요청 소스에 대한 제약 조건
  - **to**: 요청 작업에 대한 제약 조건
  - **when**: 추가적인 조건

![AuthorizationPolicy 구조](https://istio.io/latest/docs/concepts/security/authz.svg)
*출처: Istio 공식 문서*

## 3.2 최소 권한 원칙 적용하기

보안 모범 사례는 "최소 권한 원칙"을 따르는 것이다. 이는 서비스가 기능을 수행하는 데 필요한 최소한의 권한만 가져야 한다는 의미이다. Istio의 AuthorizationPolicy를 사용하면 이 원칙을 쉽게 적용할 수 있다.

예를 들어, catalog 서비스는 webapp 서비스로부터의 요청만 허용하도록 설정할 수 있다:

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: catalog-viewer
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: catalog
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/istioinaction/sa/webapp"]
```

### 실습: 서비스 간 인가 정책 설정

```bash
# AuthorizationPolicy 적용
cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: catalog-viewer
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: catalog
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/istioinaction/sa/webapp"]
EOF

# 정책 확인
kubectl get authorizationpolicy -n istioinaction

# webapp에서 catalog 호출 테스트
kubectl exec -it -n istioinaction deploy/webapp -c webapp -- curl -s http://catalog:80/api/items | jq

# 다른 서비스에서 catalog 호출 테스트 (거부됨)
kubectl exec -it deploy/sleep -c sleep -- curl -s http://catalog.istioinaction:80/api/items -v
```

![](https://velog.velcdn.com/images/juwon8891/post/ba8d9b1a-83fd-4f30-ab41-9c7e4e9b4e36/image.png)

위 테스트에서 webapp에서의 호출은 성공하지만, sleep 파드에서의 호출은 403 Forbidden 오류가 발생한다. 이는 최소 권한 원칙이 적용되었음을 보여준다.

## 3.3 경로 기반 인가 정책

더 세밀한 제어를 위해 특정 HTTP 경로나 메서드에 대한 인가 정책을 설정할 수 있다:

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: catalog-api-viewer
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: catalog
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/istioinaction/sa/webapp"]
    to:
    - operation:
        methods: ["GET"]
        paths: ["/api/catalog*"]
```

### 실습: 경로 기반 인가 정책 설정

```bash
# 기존 정책 삭제
kubectl delete authorizationpolicy catalog-viewer -n istioinaction

# 경로 기반 인가 정책 적용
cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: catalog-api-viewer
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: catalog
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/istioinaction/sa/webapp"]
    to:
    - operation:
        methods: ["GET"]
        paths: ["/api/items"]
EOF

# GET 요청 테스트 (성공)
kubectl exec -it -n istioinaction deploy/webapp -c webapp -- curl -s http://catalog:80/api/items | jq

# 요청 테스트 (거부됨)
kubectl exec deploy/sleep -- curl -sSL webapp.istioinaction/api/catalog
```

## 4. 최종 사용자 인증 및 인가

![](https://velog.velcdn.com/images/juwon8891/post/c3db33e9-0ded-44d5-9a5b-73182f4c960b/image.png)

서비스 간 인증 외에도 최종 사용자의 인증과 인가도 중요한다. Istio는 JWT(JSON Web Token)를 사용한 최종 사용자 인증을 지원한다.

![](https://velog.velcdn.com/images/juwon8891/post/0e7fa14f-688f-419a-b34f-8c8ccf5c7575/image.png)

## 4.1 RequestAuthentication 리소스 이해하기

RequestAuthentication 리소스는 JWT 토큰을 검증하기 위한 설정을 정의한다:

```yaml
apiVersion: security.istio.io/v1beta1
kind: RequestAuthentication
metadata:
  name: jwt-example
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  jwtRules:
  - issuer: "testing@secure.istio.io"
    jwksUri: "https://raw.githubusercontent.com/istio/istio/release-1.17/security/tools/jwt/samples/jwks.json"
```

## 실습: JWT 기반 인증 설정하기

### 1. JWT 테스트 토큰 생성

테스트를 위해 JWT 토큰을 생성한다:

```bash
# JWT 토큰 생성
TOKEN=$(curl -s https://raw.githubusercontent.com/istio/istio/release-1.17/security/tools/jwt/samples/demo.jwt -o -)
echo $TOKEN

# 토큰 내용 확인
JWT_PARTS=$(echo $TOKEN | awk -F. '{print $1"."$2}')
echo $JWT_PARTS | base64 -d | jq .
```

### 2. RequestAuthentication 리소스 설정

```bash
# RequestAuthentication 리소스 생성
cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1beta1
kind: RequestAuthentication
metadata:
  name: jwt-example
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  jwtRules:
  - issuer: "testing@secure.istio.io"
    jwksUri: "https://raw.githubusercontent.com/istio/istio/release-1.17/security/tools/jwt/samples/jwks.json"
EOF

# 리소스 확인
kubectl get requestauthentication -n istioinaction
```

### 3. JWT 없이 요청 테스트

```bash
# JWT 없이 요청 테스트 (성공)
kubectl exec deploy/sleep -c sleep -- curl -s http://webapp.istioinaction/api/catalog -v
```
![](https://velog.velcdn.com/images/juwon8891/post/ff459f37-8649-4cce-ae12-49ba8bf210e3/image.png)

RequestAuthentication만으로는 JWT가 없는 요청도 허용된다. JWT가 있는 경우에만 검증한다.

## 4.2 JWT 기반 인가 정책

RequestAuthentication으로 JWT를 검증한 후, AuthorizationPolicy를 사용하여 JWT 클레임에 기반한 인가 정책을 설정할 수 있다:

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: require-jwt
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  action: ALLOW
  rules:
  - from:
    - source:
        requestPrincipals: ["testing@secure.istio.io/testing@secure.istio.io"]
```

### 실습: JWT 기반 인가 정책 설정

```bash
# AuthorizationPolicy 적용
cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: require-jwt
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  action: ALLOW
  rules:
  - from:
    - source:
        requestPrincipals: ["testing@secure.istio.io/testing@secure.istio.io"]
EOF

# JWT 없이 요청 테스트 (거부됨)
kubectl exec deploy/sleep -c sleep -- curl -s http://webapp.istioinaction/api/catalog -v

# JWT 포함하여 요청 테스트 (성공)
kubectl exec deploy/sleep -c sleep -- curl -s http://webapp.istioinaction/api/catalog -H "Authorization: Bearer $TOKEN" -v
```

![](https://velog.velcdn.com/images/juwon8891/post/434bfd36-497d-4e54-9794-845342b00da1/image.png)

![](https://velog.velcdn.com/images/juwon8891/post/db1c207c-b88d-4141-af7b-0d2883afc29b/image.png)

JWT 없이 요청하면 403 Forbidden 오류가 발생하지만, 유효한 JWT를 포함하면 요청이 성공한다.

## 4.3 JWT 클레임 기반 인가

더 세밀한 제어를 위해 JWT의 특정 클레임에 기반한 인가 정책을 설정할 수 있다:

```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: require-jwt-with-claims
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  action: ALLOW
  rules:
  - from:
    - source:
        requestPrincipals: ["testing@secure.istio.io/testing@secure.istio.io"]
    when:
    - key: request.auth.claims[sub]
      values: ["testing@secure.istio.io"]
    - key: request.auth.claims[groups]
      values: ["group1"]
```

### 실습: JWT 클레임 기반 인가 정책 설정

```bash
# 기존 정책 삭제
kubectl delete authorizationpolicy require-jwt -n istioinaction

# 클레임 기반 AuthorizationPolicy 적용
cat <<EOF | kubectl apply -f -
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: require-jwt-with-claims
  namespace: istioinaction
spec:
  selector:
    matchLabels:
      app: webapp
  action: ALLOW
  rules:
  - from:
    - source:
        requestPrincipals: ["testing@secure.istio.io/testing@secure.istio.io"]
    when:
    - key: request.auth.claims[sub]
      values: ["testing@secure.istio.io"]
EOF

# JWT 포함하여 요청 테스트 (성공)
kubectl exec deploy/sleep -c sleep -- curl -s http://webapp.istioinaction/api/catalog -H "Authorization: Bearer $TOKEN" -v
```

![](https://velog.velcdn.com/images/juwon8891/post/9a6c411f-abb3-482f-9570-95581fe85c74/image.png)

Istio는 마이크로서비스 환경에서 강력한 보안 기능을 제공한다. 서비스 간 인증(mTLS), 최종 사용자 인증(JWT), 세밀한 인가 정책을 통해 마이크로서비스 아키텍처의 보안을 크게 향상시킬 수 있다.

이러한 기능을 효과적으로 활용하면 "기본적으로 안전한" 서비스 메시를 구축할 수 있으며, 보안 침해 발생 시 피해 범위를 최소화할 수 있다.

## 참고 {: .no-toc }

- [Envoy 1.19.0 공식 문서](https://www.envoyproxy.io/docs/envoy/v1.19.0/)
- [Istio 1.17 공식 문서](https://istio.io/v1.17/docs/)
- [Istio 공식 문서 - 보안](https://istio.io/latest/docs/concepts/security/)
- [Istio 공식 문서 - 보안 모범 사례](https://istio.io/latest/docs/ops/best-practices/security/)
- [SPIFFE 공식 문서](https://spiffe.io/docs/latest/spiffe-about/overview/)
- [JWT 공식 문서](https://jwt.io/introduction)
- [OPA 공식 문서](https://www.openpolicyagent.org/docs/latest/)

