export default function VoiceOrb({ phase }) {
  return (
    <div className={`voice-orb voice-orb-${phase}`}>
      <div className="voice-orb-ring" />
      <div className="voice-orb-ring voice-orb-ring-2" />
      <div className="voice-orb-core" />
    </div>
  )
}
