import { MUSIC_TOOL_DEFINITIONS } from './def.js'
import * as mac from './mac/index.js'
import { resolveExecutors, makePlatformTools } from '../shared/platform.js'

const executors = resolveExecutors(
  {
    darwin: {
      get_now_playing: mac.getNowPlayingMac,
      play_music: mac.playMusicMac,
      pause_music: mac.pauseMusicMac,
      next_track: mac.nextTrackMac,
      previous_track: mac.previousTrackMac,
      set_volume: mac.setVolumeMac
    }
  },
  'Music'
)

export const MUSIC_TOOLS = makePlatformTools(MUSIC_TOOL_DEFINITIONS, executors)
