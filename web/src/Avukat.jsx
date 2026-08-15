import SegmentPage from './SegmentPage.jsx'
import { tr } from './site/locales/tr.js'

export default function Avukat() {
  return <SegmentPage data={tr.segments.lawyers} content={tr} locale="tr" />
}
