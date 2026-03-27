import ModelSettingsPanel from '../components/ModelSettingsPanel'
import SystemSettingsPanel from '../components/SystemSettingsPanel'
import ImessageSettingsPanel from '../components/ImessageSettingsPanel'

function SettingsPage() {
  return (
    <section className="settings-page-layout">
      <div className="settings-page-inner">
        <ModelSettingsPanel />
        <SystemSettingsPanel />
        <ImessageSettingsPanel />
      </div>
    </section>
  )
}

export default SettingsPage
