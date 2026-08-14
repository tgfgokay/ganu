import SegmentPage from './SegmentPage.jsx'
import { tr } from './site/locales/tr.js'

export default function MaliMusavir() {
  return <SegmentPage data={tr.segments.accountants} content={tr} locale="tr" />
}
