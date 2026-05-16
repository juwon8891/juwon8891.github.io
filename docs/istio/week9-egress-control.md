---
tags:
  - Istio
  - Egress
---

# Egress Control 실습: REGISTRY_ONLY 모드로 외부 트래픽 잠그기

> REGISTRY_ONLY 모드로 외부 트래픽을 차단하고 ServiceEntry로 허용 도메인만 선별적으로 허용하는 방법을 정리한다.

Istio 1.17에서 `REGISTRY_ONLY` 모드로 아웃바운드 트래픽을 전면 차단한 뒤, `ServiceEntry`와 `VirtualService`로 필요한 외부 도메인만 선별적으로 허용하는 과정을 정리한다.

---


## 배경 & 아키텍처<a id="배경--아키텍처"></a>
Istio는 기본적으로 **클러스터 외부** 목적지로 나가는 트래픽을 `"ALLOW_ANY"` 로 열어 둡니다.  그러나 보안·규정 준수·NW 비용 절감 등의 이유로 

* "레지스트리에 등록된 목적지(**ServiceEntry**) **외에는 전부 차단**"
* "특정 도메인만 HTTP/HTTPS 허용, 나머지는 503 반환"

같은 요구가 잦다.  이를 위해 Istio **MeshConfig** 의 `outboundTrafficPolicy.mode` 값을  `ALLOW_ANY → REGISTRY_ONLY` 로 바꾸면 **디폴트‑차단** 상태가 된다.

> **REGISTRY_ONLY** = “Service Mesh 내 레지스트리에 *등록된* 호스트만 통과”

---

## 실습 환경 준비<a id="실습-환경-준비"></a>
아래 명령은 **kind** + Istio 1.17 환경을 가정한다.  미리 설치되어 있지 않다면 ①‑③ 단계를 먼저 수행하세요.

| 순서 | 작업 | 명령 |
|------|------|------|
| ① | kind 클러스터 생성 | `kind create cluster --name myk8s` |
| ② | Istio 1.17 설치 | `istioctl install --set profile=default -y` |
| ③ | 네임스페이스 생성 & 자동 주입 ON | `kubectl create ns istioinaction && kubectl label ns istioinaction istio-injection=enabled` |

---

## 기본 (ALLOW_ANY) 동작 점검<a id="기본-allow_any-동작-점검"></a>
```bash
# 테스트 파드(curl) 배포
kubectl apply -n istioinaction \
  -f https://raw.githubusercontent.com/istio/istio/release-1.17/samples/curl/curl.yaml

# 파드 변수 저장
SOURCE=$(kubectl -n istioinaction get pod -l app=curl -ojsonpath='{.items[0].metadata.name}')

# 외부 HTTPS 정상 확인
kubectl exec -n istioinaction $SOURCE -c curl -- \
  curl -sSI https://www.google.com | grep HTTP/
```
> 결과: `HTTP/2 200` → 외부 통신이 열려 있음을 확인.

---

## REGISTRY_ONLY 모드로 전환<a id="registry_only-모드로-전환"></a>
```bash
istioctl install --set meshConfig.outboundTrafficPolicy.mode=REGISTRY_ONLY -y
sleep 30   # 설정 전파 대기

# 이제 외부 호출이 막혀야 함
kubectl exec -n istioinaction $SOURCE -c curl -- \
  curl -sSI https://www.google.com || echo "X blocked"
```
`connection refused` 혹은 `503` 이 출력되면 성공적으로 차단된 것이다.

---

## HTTP 외부 도메인 허용 — `httpbin.org`<a id="http-외부-도메인-허용--httpbinorg"></a>
```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: httpbin-ext
spec:
  hosts:
  - httpbin.org
  ports:
  - number: 80
    name: http
    protocol: HTTP
  location: MESH_EXTERNAL
  resolution: DNS
EOF

# 허용 확인
kubectl exec -n istioinaction $SOURCE -c curl -- \
  curl -s http://httpbin.org/headers | jq .
```
> 이제 `http://httpbin.org` 는 통과, 다른 외부 도메인은 여전히 차단된다.

---

## HTTPS 외부 도메인 허용 — `www.google.com`<a id="https-외부-도메인-허용--wwwgooglecom"></a>
```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.istio.io/v1
kind: ServiceEntry
metadata:
  name: google-https
spec:
  hosts:
  - www.google.com
  ports:
  - number: 443
    name: https
    protocol: HTTPS
  location: MESH_EXTERNAL
  resolution: DNS
EOF

kubectl exec -n istioinaction $SOURCE -c curl -- \
  curl -sSI https://www.google.com | grep HTTP/
```

---

## VirtualService 로 타임아웃 제어<a id="virtualservice-로-타임아웃-제어"></a>
`/delay/5` 엔드포인트는 5초 후 응답한다.  **timeout 3s** 로 자르면 504 오류가 발생해야 한다.

```bash
# baseline — 약 5초 후 200
kubectl exec -n istioinaction $SOURCE -c curl -- \
  time curl -o /dev/null -s -w '%{http_code}\n' http://httpbin.org/delay/5

# VirtualService 생성
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: httpbin-timeout
spec:
  hosts:
  - httpbin.org
  http:
  - timeout: 3s
    route:
    - destination:
        host: httpbin.org
EOF

# 재시도 — 약 3초 뒤 504
kubectl exec -n istioinaction $SOURCE -c curl -- \
  time curl -o /dev/null -s -w '%{http_code}\n' http://httpbin.org/delay/5
```

---

## 실습 결과 요약

위 실습을 통해 다음과 같은 결과를 얻었다:

| 단계 | 동작 | 결과 |
|------|------|------|
| 기본 (`ALLOW_ANY`) | 모든 외부 트래픽 허용 | `HTTP 200` |
| `REGISTRY_ONLY` 전환 | 외부 트래픽 전면 차단 | `503 또는 connection refused` |
| HTTP 도메인 허용 (`httpbin.org`) | 지정된 HTTP 도메인만 허용 | `HTTP 200` (다른 도메인은 차단) |
| HTTPS 도메인 허용 (`www.google.com`) | 지정된 HTTPS 도메인만 허용 | `HTTP 200` |
| `VirtualService` 타임아웃 설정 | 요청 시간 제한 | `HTTP 504` (타임아웃 발생 시) |

---

## 주의 사항 및 권장 사항

- **운영 환경에서는** `REGISTRY_ONLY` 모드를 신중히 사용해야 한다. 필요한 모든 외부 도메인을 반드시 미리 `ServiceEntry`로 등록하세요.
- 서비스 도메인의 변경 및 추가가 빈번한 경우, 관리 및 자동화 프로세스를 구축하는 것이 권장된다.
- 타임아웃 등의 정책 설정을 통해 네트워크 안정성과 서비스 품질을 유지하세요.

---

## 결론 {: .no-toc }

Istio의 `REGISTRY_ONLY` 모드를 활용하면 클러스터에서 외부로 향하는 트래픽을 강력하게 제어할 수 있다. 필요한 목적지만 명시적으로 허용함으로써, 보안과 규정 준수를 강화하고 불필요한 네트워크 비용을 절감할 수 있다. 다만, 설정을 엄격히 유지하면서 서비스 운영에 지장을 주지 않도록 관리 자동화와 지속적인 모니터링이 필수적이다.

---

