// @toast-ui/editor는 패키지 루트 타입만 제공 — 뷰어 전용 deep import 경로에 같은 Viewer
// 클래스 타입을 연결한다 (런타임 번들만 다르고 API는 동일).
declare module '@toast-ui/editor/dist/toastui-editor-viewer' {
  import { Viewer } from '@toast-ui/editor'
  export default Viewer
}
