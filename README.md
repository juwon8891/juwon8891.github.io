# 학습 정리

MkDocs Material 테마를 사용한 학습 내용 정리 문서 사이트

## 🌐 사이트

https://juwon8891.github.io

## 📁 구조

```
juwon8891.github.io/
├── mkdocs.yml          # MkDocs 설정
├── docs/               # 문서 디렉토리
│   ├── index.md        # 홈페이지
│   ├── cuda/           # CUDA 관련 문서
│   ├── eks/            # EKS 관련 문서
│   ├── k8s-deploy/     # K8s Deploy 관련 문서
│   └── cicd/           # CI/CD 관련 문서
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions 배포 설정
└── requirements.txt    # Python 의존성
```

## 📝 새 글 작성 방법

1. `docs/` 디렉토리 하위에 카테고리별로 마크다운 파일 생성
2. `mkdocs.yml`의 `nav` 섹션에 새 문서 추가
3. 본문 작성 (마크다운 형식, Front matter 불필요)

예시:
```bash
# 새 CUDA 관련 문서 작성
vim docs/cuda/new-topic.md

# mkdocs.yml에 추가
# nav:
#   - CUDA:
#     - New Topic: cuda/new-topic.md
```

## 🚀 배포

GitHub에 push하면 자동으로 GitHub Actions가 실행되어 GitHub Pages에 배포됩니다.

```bash
git add .
git commit -m "Add new document"
git push origin main
```

## 💻 로컬 개발

```bash
# 의존성 설치
pip install -r requirements.txt

# 로컬 서버 실행
mkdocs serve

# 브라우저에서 http://127.0.0.1:8000 접속
```

## 🎨 테마

- [MkDocs Material](https://squidfunk.github.io/mkdocs-material/)
- 다크 모드 지원
- 검색 기능
- 코드 하이라이팅
- Mermaid 다이어그램 지원
