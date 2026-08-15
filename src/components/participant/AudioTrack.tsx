// @livekit/components-react@2.0.4
// Apache-2.0

import { useMediaTrackBySourceOrName } from '../../signals/useMediaTrackBySourceOrName'
import type { TrackReference } from '@livekit/components-core'
import { log } from '@livekit/components-core'
import { RemoteAudioTrack, RemoteTrackPublication } from 'livekit-client'
import { useEnsureTrackRef, useMaybeRoomContext } from '../../context'
import type { JSX } from 'solid-js/jsx-runtime'
import { createEffect } from 'solid-js'

/** @public */
export interface AudioTrackProps extends JSX.AudioHTMLAttributes<HTMLAudioElement> {
  /** The track reference of the track from which the audio is to be rendered. */
  trackRef?: TrackReference

  onSubscriptionStatusChanged?: (subscribed: boolean) => void
  /** Sets the volume of the audio track. By default, the range is between `0.0` and `1.0`. */
  volume?: number
  /**
   * Mutes the audio track if set to `true`.
   * @remarks
   * If set to `true`, the server will stop sending audio track data to the client.
   * @alpha
   */
  muted?: boolean
  /**
   * Whether to allow volume above 1 (amplification).
   *
   * @remarks
   * Requires the room to have been created with `webAudioMix`, which gives
   * livekit a shared AudioContext to hang a GainNode off. Without it there is
   * no gain stage and volume is clamped to 1, since `HTMLMediaElement.volume`
   * cannot amplify.
   */
  enableBoosting?: boolean
}

/**
 * The AudioTrack component is responsible for rendering participant audio tracks.
 * This component must have access to the participant's context, or alternatively pass it a `Participant` as a property.
 *
 * Must be using key in parent tree: (e.g. <Key />, <Show keyed />)
 * (to ensure AudioTrack is unique to each Track and props don't suddenly update to another track!)
 *
 * @example
 * ```tsx
 *   <ParticipantTile>
 *     <AudioTrack trackRef={trackRef} />
 *   </ParticipantTile>
 * ```
 *
 * @see `ParticipantTile` component
 * @public
 */
export function AudioTrack(props: AudioTrackProps) {
  const trackReference = useEnsureTrackRef(props.trackRef)

  let mediaEl: HTMLAudioElement | undefined

  const { elementProps, isSubscribed, track, publication } = useMediaTrackBySourceOrName(
    trackReference,
    {
      element: () => mediaEl,
      props,
    },
  )

  createEffect(() => {
    props.onSubscriptionStatusChanged?.(!!isSubscribed())
  })

  const room = useMaybeRoomContext()

  /**
   * Whether the room mixes remote audio through livekit's shared AudioContext
   * (`RoomOptions.webAudioMix`). With a context in play the SDK routes
   * `setVolume` into a GainNode, so values above 1 amplify; without one the
   * volume lands on `HTMLMediaElement.volume`, which cannot exceed 1.
   */
  const canBoost = () => !!room?.()?.options.webAudioMix

  // Volume is delegated wholesale to the SDK. It owns the Web Audio graph:
  // it rebuilds the source node on every `attach()`, which is what makes a
  // boosted participant survive a reconnect — livekit swaps the track in
  // place under the same trackSid, so the component is never remounted and
  // anything cached here would stay bound to the dead MediaStreamTrack.
  createEffect(() => {
    const t = track()
    if (t === undefined || props.volume === undefined) {
      return
    }
    if (!(t instanceof RemoteAudioTrack)) {
      log.warn('Volume can only be set on remote audio tracks.')
      return
    }
    // Clamp with no gain stage available: assigning above 1 to a media
    // element throws in some browsers and silently clamps in the rest, so
    // make the cap explicit rather than browser-dependent.
    t.setVolume(props.enableBoosting && canBoost() ? props.volume : Math.min(props.volume, 1))
  })

  createEffect(() => {
    const pub = publication()
    if (pub === undefined || props.muted === undefined) {
      return
    }
    if (pub instanceof RemoteTrackPublication) {
      pub.setEnabled(!props.muted)
    } else {
      log.warn('Can only call setEnabled on remote track publications.')
    }
  })

  return <audio ref={mediaEl} {...elementProps()} />
}
