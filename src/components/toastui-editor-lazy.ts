// dynamic()은 JS만 지연 — 정적 CSS import는 즉시 번들되므로, CSS를 이 lazy 모듈에 묶어
// 에디터 JS 청크와 함께 필요할 때만 로드한다. (Turbopack은 CSS의 dynamic import()를 지원하지 않아
// dynamic factory 안에서 import('...css')를 직접 호출하는 방식은 빌드가 실패한다.)
// Viewer는 여기서 export하지 않는다 — react-editor index를 거치면 풀 에디터(~940KB)가 딸려오므로
// 뷰어 전용 페이지는 toastui-viewer-lazy(viewer 단독 빌드 ~433KB)를 쓴다.
import '@toast-ui/editor/dist/toastui-editor.css'
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css'

export { Editor } from '@toast-ui/react-editor'
