import { SiWhatsapp, SiTelegram, SiDiscord, SiSlack } from 'react-icons/si'

const BRAND_COLORS = {
  whatsapp: '#25D366',
  telegram: '#26A5E4',
  discord: '#5865F2',
  slack: '#4A154B'
}

const ICONS = {
  whatsapp: SiWhatsapp,
  telegram: SiTelegram,
  discord: SiDiscord,
  slack: SiSlack
}

function ChannelIcon({ channel, size = 20 }) {
  const Icon = ICONS[channel]
  if (!Icon) return null
  return <Icon size={size} color={BRAND_COLORS[channel]} />
}

export default ChannelIcon
