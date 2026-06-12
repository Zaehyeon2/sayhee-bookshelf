// dynamic()은 JS만 지연 — 정적 CSS import는 즉시 번들되므로, CSS를 이 lazy 모듈에 묶어
// 에디터 JS 청크와 함께 필요할 때만 로드한다. (Turbopack은 CSS의 dynamic import()를 지원하지 않아
// dynamic factory 안에서 import('...css')를 직접 호출하는 방식은 빌드가 실패한다.)
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

export { Editor, Viewer } from '@toast-ui/react-editor'
