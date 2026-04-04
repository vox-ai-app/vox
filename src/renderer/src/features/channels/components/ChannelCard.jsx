import { Loader2, ChevronRight, Power, Info } from 'lucide-react'
import ChannelIcon from './ChannelIcon'

function ChannelCard({ def, connected, connecting, onSetup, onDisconnect, onShowGuide }) {
  return (
    <div className={`channel-card${connected ? ' channel-card-connected' : ''}`}>
      <div className="channel-card-left">
        <span className="channel-card-icon">
          <ChannelIcon channel={def.id} size={20} />
        </span>
        <div className="channel-card-info">
          <div className="channel-card-name-row">
            <h3 className="channel-card-name">{def.label}</h3>
            {connected && <span className="channel-card-live-dot" />}
          </div>
          <p className="channel-card-desc">{connected ? def.connectedHint : def.description}</p>
        </div>
      </div>

      <div className="channel-card-right">
        {!connected && def.steps?.length > 0 && (
          <button
            className="channel-card-info-btn"
            onClick={() => onShowGuide(def.id)}
            title="Setup guide"
            type="button"
          >
            <Info size={15} />
          </button>
        )}
        {connected ? (
          <button
            className="channel-btn channel-btn-disconnect"
            disabled={connecting}
            onClick={() => onDisconnect(def.id)}
            title="Disconnect"
            type="button"
          >
            <Power size={14} />
          </button>
        ) : (
          <button
            className="channel-btn channel-btn-setup"
            disabled={connecting}
            onClick={() => onSetup(def.id)}
            type="button"
          >
            {connecting ? (
              <Loader2 className="channel-btn-spin" size={14} />
            ) : (
              <>
                <span>Set up</span>
                <ChevronRight size={14} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default ChannelCard
