import { useState } from 'react'
import { useChannelsStore } from '../hooks/useChannelsStore'
import ChannelCard from '../components/ChannelCard'
import ChannelSetupDrawer from '../components/ChannelSetupDrawer'
import SetupGuideModal from '../components/SetupGuideModal'
import ActivityFeed from '../components/ActivityFeed'
import ThreadDrawer from '../components/ThreadDrawer'

function ChannelsPage() {
  const {
    definitions,
    connectedMap,
    connecting,
    error,
    qrCode,
    activeDrawer,
    activity,
    threadTarget,
    threadData,
    connect,
    disconnect,
    openSetup,
    closeSetup,
    openThread,
    closeThread
  } = useChannelsStore()

  const [guideChannel, setGuideChannel] = useState(null)
  const guideDef = guideChannel ? definitions.find((d) => d.id === guideChannel) : null

  const activeCount = Object.values(connectedMap).filter(Boolean).length
  const activeDef = activeDrawer ? definitions.find((d) => d.id === activeDrawer) : null

  return (
    <section className="channels-page">
      <div className="channels-page-header">
        <h1 className="channels-page-title">
          Channels
          <span className="channels-beta-badge">Beta</span>
        </h1>
        <p className="channels-page-subtitle">
          Connect your messaging apps and let Vox reply for you. This feature is still under
          testing.
          {activeCount > 0 && <span className="channels-active-count">{activeCount} live</span>}
        </p>
      </div>

      <div className="channels-grid">
        {definitions.map((def) => (
          <ChannelCard
            connected={!!connectedMap[def.id]}
            connecting={!!connecting[def.id]}
            def={def}
            key={def.id}
            onDisconnect={disconnect}
            onSetup={openSetup}
            onShowGuide={setGuideChannel}
          />
        ))}
      </div>

      <ActivityFeed activity={activity} onOpenThread={openThread} />

      <ChannelSetupDrawer
        connected={activeDrawer ? connectedMap[activeDrawer] : false}
        connecting={activeDrawer ? connecting[activeDrawer] : false}
        def={activeDef}
        error={error}
        onClose={closeSetup}
        onConnect={connect}
        open={!!activeDrawer}
        qrCode={qrCode}
      />

      <SetupGuideModal def={guideDef} onClose={() => setGuideChannel(null)} open={!!guideChannel} />

      <ThreadDrawer
        data={threadData}
        onClose={closeThread}
        open={!!threadTarget}
        target={threadTarget}
      />
    </section>
  )
}

export default ChannelsPage
