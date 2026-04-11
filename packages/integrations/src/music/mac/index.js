import { runAppleScript, esc } from '../../shared/applescript/index.js'

export const getNowPlayingMac = async (_payload, { signal } = {}) => {
  const script = [
    'tell application "Music"',
    '  if player state is stopped then return "STATE:stopped"',
    '  set t to name of current track',
    '  set a to artist of current track',
    '  set al to album of current track',
    '  set d to duration of current track',
    '  set p to player position',
    '  set s to player state as string',
    '  return t & "\\t" & a & "\\t" & al & "\\t" & (d as string) & "\\t" & (p as string) & "\\t" & s',
    'end tell'
  ]
  const out = await runAppleScript(script, signal)
  if (out === 'STATE:stopped') {
    return { state: 'stopped' }
  }
  const [name, artist, album, duration, position, state] = out.split('\t')
  return {
    name: name || '',
    artist: artist || '',
    album: album || '',
    duration: parseFloat(duration) || 0,
    position: parseFloat(position) || 0,
    state: state || 'unknown'
  }
}

export const playMusicMac = async (payload, { signal } = {}) => {
  const query = String(payload?.query ?? '').trim()
  if (!query) {
    await runAppleScript(['tell application "Music" to play'], signal)
    return { status: 'playing' }
  }
  const script = [
    'tell application "Music"',
    `  set results to (every track whose name contains "${esc(query)}" or artist contains "${esc(query)}" or album contains "${esc(query)}")`,
    '  if (count of results) > 0 then',
    '    play item 1 of results',
    '    set t to name of current track',
    '    set a to artist of current track',
    '    return t & "\\t" & a',
    '  else',
    '    return "NOT_FOUND"',
    '  end if',
    'end tell'
  ]
  const out = await runAppleScript(script, signal)
  if (out === 'NOT_FOUND') {
    return { status: 'not_found', query }
  }
  const [name, artist] = out.split('\t')
  return { status: 'playing', name, artist }
}

export const pauseMusicMac = async (_payload, { signal } = {}) => {
  await runAppleScript(['tell application "Music" to pause'], signal)
  return { status: 'paused' }
}

export const nextTrackMac = async (_payload, { signal } = {}) => {
  await runAppleScript(['tell application "Music" to next track'], signal)
  return { status: 'skipped' }
}

export const previousTrackMac = async (_payload, { signal } = {}) => {
  await runAppleScript(['tell application "Music" to previous track'], signal)
  return { status: 'previous' }
}

export const setVolumeMac = async (payload, { signal } = {}) => {
  const volume = Math.min(100, Math.max(0, Math.round(Number(payload?.volume ?? 50))))
  await runAppleScript([`tell application "Music" to set sound volume to ${volume}`], signal)
  return { status: 'volume_set', volume }
}
