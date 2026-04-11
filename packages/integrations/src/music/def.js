export const MUSIC_TOOL_DEFINITIONS = [
  {
    name: 'get_now_playing',
    description:
      'Get the currently playing track in Apple Music (Music.app) on macOS. Returns track name, artist, album, duration, player position, and player state (playing/paused/stopped).',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'play_music',
    description:
      "Play a track, album, or playlist in Apple Music by searching the user's library. If no query is provided, resumes playback of the current track.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            "Search term to find a track, album, or playlist. Searches the user's Music library. If omitted, resumes current playback."
        }
      },
      required: []
    }
  },
  {
    name: 'pause_music',
    description: 'Pause the currently playing track in Apple Music.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'next_track',
    description: 'Skip to the next track in Apple Music.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'previous_track',
    description: 'Go back to the previous track in Apple Music.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'set_volume',
    description: 'Set the playback volume for Apple Music (0 to 100).',
    parameters: {
      type: 'object',
      properties: {
        volume: {
          type: 'number',
          description: 'Volume level from 0 (mute) to 100 (max).'
        }
      },
      required: ['volume']
    }
  }
]
