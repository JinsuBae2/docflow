import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const mitBody = readFileSync('LICENSE', 'utf8').split('Permission is hereby granted')[1];
const entries = [];
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const meta = JSON.parse(readFileSync(path + '/package.json', 'utf8'));
  const files = readdirSync(path)
    .filter((name) => /^(licen[sc]e|copying|notice)/i.test(name))
    .sort();
  let license =
    typeof meta.license === 'string'
      ? meta.license
      : meta.licenses?.map((item) => item.type).join(' OR ');
  const notices = files.map((name) => ({ name, text: readFileSync(path + '/' + name, 'utf8') }));
  if (
    !license &&
    meta.name === 'khroma' &&
    notices.some((item) => item.text.includes('The MIT License'))
  )
    license = 'MIT';
  if (meta.name === 'format' && !notices.length && license === 'MIT') {
    const readme = readFileSync(path + '/Readme.md', 'utf8');
    const copyright = readme.match(/^Copyright .+$/m)?.[0];
    if (!copyright) throw new Error('Missing format copyright notice');
    notices.push({
      name: 'MIT (package licenses + Readme copyright)',
      text: 'MIT License\n\n' + copyright + '\n\nPermission is hereby granted' + mitBody,
    });
  }
  if (!license || !notices.length) throw new Error('Unresolved license: ' + path);
  const repository = typeof meta.repository === 'string' ? meta.repository : meta.repository?.url;
  entries.push({ name: meta.name, version: meta.version, license, repository, notices });
}
entries.sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version, 'en'));
let output =
  '# 외부 소프트웨어 고지\n\nDocflow 자체 코드는 MIT입니다. 아래 외부 구성요소에는 각각의 원래 라이선스가 적용됩니다. 이 목록은 package-lock.json의 production 의존성을 기준으로 생성하며, 번들에 포함되지 않는 항목도 보수적으로 포함합니다.\n\n';
output +=
  'Electron 런타임의 LICENSE와 LICENSES.chromium.html은 설치 파일에 별도로 포함됩니다. 개발 도구의 라이선스는 각 패키지에서 확인할 수 있습니다.\n\n';
output +=
  'elkjs 0.9.3은 EPL-2.0입니다. 수정하지 않은 배포물을 사용하며 소스는 https://github.com/kieler/elkjs/tree/0.9.3 에서 확인할 수 있습니다. ELK 원본과 빌드 방법은 해당 저장소의 README 및 빌드 설정을 참고하세요. DOMPurify는 이 배포에서 Apache-2.0 옵션을 사용하며 원본의 두 라이선스 문서를 모두 보존합니다.\n\n';
for (const item of entries) {
  output += `## ${item.name} ${item.version}\n\n라이선스: ${item.license}\n\n`;
  if (item.repository) output += `원본 저장소: ${item.repository}\n\n`;
  for (const notice of item.notices)
    output += `### ${notice.name}\n\n\`\`\`text\n${notice.text.trim()}\n\`\`\`\n\n`;
}
output +=
  '## Electron runtime\n\n```text\n' +
  readFileSync('node_modules/electron/dist/LICENSE', 'utf8').trim() +
  '\n```\n';
writeFileSync('THIRD_PARTY_NOTICES.md', output);
console.log(`Generated notices for ${entries.length} production package entries.`);
