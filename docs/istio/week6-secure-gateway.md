---
tags:
  - Istio
  - TLS
---

# Istio Secure Gateway 실습

> kind 클러스터에서 Istio 공식 Secure Ingress 예제를 재현하기 위한 실습 가이드. SIMPLE/MUTUAL TLS 모드를 단계별로 정리한다.

로컬 **kind** 클러스터에서 Istio 공식 _Secure Ingress_ 예제를 그대로 재현하기 위한 가이드이다. 복사‑붙여넣기만으로 동작하도록 모든 명령을 하나의 블록으로 묶었다.

---

## 0. 사전 준비 (요약)

| 순서 | 작업 | 명령 |
|------|------|------|
|①|kind 클러스터 생성| Istio Gateway 포트 맵핑 (NodePort 30000, 30005) |
|②|Istio 1.17 설치|`istioctl install --set profile=default -y`|
|④|연습 네임스페이스|`kubectl create ns istioinaction && kubectl label ns istioinaction istio-injection=enabled`|

> **CRD 확인** : `kubectl get crd | grep gateways.networking.istio.io` — Gateway·VirtualService CRD가 보여야 다음 단계로 넘어간다.

---

## 1. 환경 변수 설정

```bash
export INGRESS_HOST=127.0.0.1   # kind → localhost
export INGRESS_PORT=30000       # HTTP
export SECURE_INGRESS_PORT=30005  # HTTPS
```

---

## 2. 샘플 애플리케이션 배포

```bash
export ISTIO_TAG=release-1.25

# httpbin
kubectl apply -n istioinaction -f \
  https://raw.githubusercontent.com/istio/istio/${ISTIO_TAG}/samples/httpbin/httpbin.yaml

# sleep (curl 테스트용)
kubectl apply -n istioinaction -f \
  https://raw.githubusercontent.com/istio/istio/${ISTIO_TAG}/samples/sleep/sleep.yaml
```

---

## 3. 인증서 생성

```bash
mkdir certs && cd certs
# 3‑1) Root CA
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -subj "/O=example Inc./CN=example.com" \
  -keyout ca.key -out ca.crt
# 3‑2) httpbin 서버 cert
openssl req -newkey rsa:2048 -nodes \
  -keyout httpbin.key -out httpbin.csr \
  -subj "/CN=httpbin.example.com"
openssl x509 -req -days 365 -in httpbin.csr -CA ca.crt -CAkey ca.key \
  -set_serial 0 -out httpbin.crt
# 3‑3) (선택) 클라이언트 cert
openssl req -newkey rsa:2048 -nodes \
  -keyout client.key -out client.csr \
  -subj "/CN=client.example.com"
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key \
  -set_serial 1 -out client.crt
cd ..
```

---

## 4. HTTPS Ingress — `SIMPLE` 모드

### 4‑1. Secret

```bash
kubectl create -n istio-system secret tls httpbin-cred \
  --key certs/httpbin.key \
  --cert certs/httpbin.crt
```

### 4‑2. Gateway & VirtualService (한 번에 적용)

```bash
kubectl apply -n istioinaction -f - <<'EOF'
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: httpbin-gateway
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    hosts:
    - httpbin.example.com
    tls:
      mode: SIMPLE
      credentialName: httpbin-cred
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: httpbin
spec:
  hosts:
  - httpbin.example.com
  gateways:
  - httpbin-gateway
  http:
  - match:
    - uri:
        prefix: /
    route:
    - destination:
        host: httpbin
        port:
          number: 8000
EOF
```

### 4‑3. 검증

```bash
curl -v --resolve "httpbin.example.com:${SECURE_INGRESS_PORT}:${INGRESS_HOST}" \
  --cacert certs/ca.crt \
  https://httpbin.example.com:${SECURE_INGRESS_PORT}/status/418
```

![](https://velog.velcdn.com/images/juwon8891/post/a860c166-2b93-45d0-8bc3-c33e27de7b5f/image.png)

---

## 5. Mutual TLS Ingress — `MUTUAL` 모드

### 5‑1. Secret (CA 포함)

```bash
kubectl delete -n istio-system secret httpbin-cred
kubectl create -n istio-system secret generic httpbin-cred \
  --from-file=key=certs/httpbin.key \
  --from-file=cert=certs/httpbin.crt \
  --from-file=cacert=certs/ca.crt
```

### 5‑2. Gateway 모드 변경

```bash
kubectl patch gateway -n istioinaction httpbin-gateway --type json \
  -p='[{"op":"replace","path":"/spec/servers/0/tls/mode","value":"MUTUAL"}]'
```

### 5‑3. 검증 (클라이언트 cert 필요)

```bash
curl -v --resolve "httpbin.example.com:${SECURE_INGRESS_PORT}:${INGRESS_HOST}" \
  --cacert certs/ca.crt \
  --cert  certs/client.crt \
  --key   certs/client.key \
  https://httpbin.example.com:${SECURE_INGRESS_PORT}/status/418
```

![](https://velog.velcdn.com/images/juwon8891/post/38434c7c-40fe-4999-91ba-31826b9b156c/image.png)

---

## 6. 정리(Cleanup)

```bash
kubectl delete ns istioinaction
kind delete cluster --name myk8s
rm -rf certs istio-*
```
