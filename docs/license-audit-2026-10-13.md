# 라이선스·배포 의존성 점검

점검일: 2026-10-13. 이 문서는 기술적 점검 기록이며 법률 심사·인증서가 아닙니다.

## Docflow 자체 코드

MIT 표준 원문을 LICENSE에 추가하고 저작권자를 JinsuBae2 and Docflow contributors로 기재했습니다. MIT는 별도 발급이나 승인 절차 없이 권리자가 사용 조건을 선언하는 방식입니다. AI 활용 사실은 AI_USAGE.md에 별도로 공개합니다. AI 생성 사실이나 서비스의 출력 소유권 조건만으로 제삼자 권리 검사가 끝난 것으로 보지 않습니다.

참고: [MIT 적용 방법](https://choosealicense.com/licenses/mit/), [GitHub 라이선스 안내](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository), [OpenAI 이용 조건의 콘텐츠 조항](https://openai.com/policies/row-terms-of-use/).

## 외부 의존성

package-lock.json의 production 항목 238개와 설치된 패키지의 package.json, LICENSE/NOTICE 파일을 확인했습니다. 개발 도구까지 포함한 전체 권리 심사나 모든 코드 줄의 독창성 확인을 의미하지 않습니다.

- 대부분 MIT, ISC, BSD, Apache-2.0, Unlicense 계열입니다.
- `format`은 구형 `licenses` 필드와 README의 저작권 고지로 MIT를 확인했습니다. 해당 고지와 표준 MIT 본문을 보존합니다.
- `khroma`는 package.json의 license 누락을 포함된 MIT 원문으로 보완했습니다.
- `dompurify`의 이중 라이선스 중 Apache-2.0 옵션을 사용하고 원문 파일을 모두 보존합니다.
- `elkjs` 0.9.3은 EPL-2.0이며 Docflow의 MIT로 재라이선스하지 않습니다. 수정하지 않은 패키지의 EPL 원문과 [정확한 소스 태그](https://github.com/kieler/elkjs/tree/0.9.3)를 고지합니다. 이후 elkjs 자체를 수정하면 소스 제공 조건을 다시 확인해야 합니다.

`npm run licenses`는 항목의 라이선스 또는 고지 파일을 찾지 못하면 실패합니다. 생성된 THIRD_PARTY_NOTICES.md에는 원문을 보존하며 설치 파일의 Resources에도 포함합니다. Electron의 MIT 원문을 해당 고지에 포함하고 LICENSES.chromium.html도 앱에 함께 배포합니다.

사용자 문서와 테스트 계정 데이터는 배포하지 않습니다. 문서용 화면은 앱의 예제 데이터로 새로 촬영했습니다. 외부 사진·웹폰트를 새로 추가하지 않았습니다. Lucide 아이콘 등은 의존성 고지에 포함합니다.

## 알려진 취약점 조회

`npm audit --omit=dev --json` 실행 결과 production 의존성의 알려진 취약점은 0건이었습니다. 점검 시점의 데이터베이스 결과이며 취약점 부재나 전체 보안을 보장하지 않습니다.

## 공개 조건

점검 당시 저장소는 사용자의 지시에 따라 비공개였으며, 이후 공개 저장소로 전환했습니다. 보안 신고 경로는 [SECURITY.md](../SECURITY.md)를 따릅니다. 설치 파일을 배포할 때 실제 배포 대상의 고지를 다시 확인합니다. macOS 코드 서명·공증과 Windows/Intel Mac 실기기 검증은 별도입니다.
