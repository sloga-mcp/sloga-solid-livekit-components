// @livekit/components-react@2.0.4
// Apache-2.0

import type { TrackIdentifier } from '@livekit/components-core'
import { isTrackReference } from '@livekit/components-core'
import { setupMediaTrack, log, isLocal, getTrackByIdentifier } from '@livekit/components-core'
import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { JSX } from 'solid-js/jsx-runtime'

/** @public */
export interface UseMediaTrackOptions {
  element?: () => HTMLMediaElement | undefined
  props?: JSX.HTMLAttributes<HTMLVideoElement | HTMLAudioElement>
}

/**
 * @internal
 */
export function useMediaTrackBySourceOrName(
  observerOptions: TrackIdentifier,
  options: UseMediaTrackOptions = {},
) {
  const [publication, setPublication] = createSignal(getTrackByIdentifier(observerOptions))

  const [isMuted, setMuted] = createSignal(publication()?.isMuted)
  const [isSubscribed, setSubscribed] = createSignal(publication()?.isSubscribed)

  const [track, setTrack] = createSignal(publication()?.track)
  const [orientation, setOrientation] = createSignal<'landscape' | 'portrait'>('landscape')
  // Tracked as a PAIR so the effect detaches the track it actually attached.
  // The previous shape detached the *new* track from the *old* element (a
  // no-op, since that track was never on it) and skipped detaching entirely
  // when the track went away, leaving dead tracks in livekit's
  // `attachedElements` for the lifetime of the room.
  let attachedTrack: ReturnType<typeof track>
  let attachedElement: HTMLMediaElement | undefined

  const detachCurrent = () => {
    if (attachedTrack && attachedElement) {
      attachedTrack.detach(attachedElement)
    }
    attachedTrack = undefined
    attachedElement = undefined
  }

  const mediaTrack = createMemo(() => {
    // { className, trackObserver }
    return setupMediaTrack(observerOptions)
  }, [
    observerOptions.participant.sid ?? observerOptions.participant.identity,
    observerOptions.source,
    isTrackReference(observerOptions) && observerOptions.publication.trackSid,
  ])

  createEffect(() => {
    const subscription = mediaTrack().trackObserver.subscribe(publication => {
      log.debug('update track', publication)
      setPublication(publication)
      setMuted(publication?.isMuted)
      setSubscribed(publication?.isSubscribed)
      setTrack(publication?.track)
    })

    onCleanup(() => subscription.unsubscribe())
  })

  createEffect(() => {
    const t = track()
    const el = options.element?.()

    // Re-runs whenever the publication's track changes — including to
    // `undefined` on unpublish, which is exactly when the old track has to come
    // off the element.
    detachCurrent()

    if (!t || !el) return
    // Never attach local audio: it would play the user's own mic back at them.
    if (isLocal(observerOptions.participant) && t.kind === 'audio') return

    t.attach(el)
    attachedTrack = t
    attachedElement = el
  })

  onCleanup(detachCurrent)

  createEffect(() => {
    // Set the orientation of the video track.
    // TODO: This does not handle changes in orientation after a track got published (e.g when rotating a phone camera from portrait to landscape).
    const pub = publication()
    if (typeof pub?.dimensions?.width === 'number' && typeof pub.dimensions?.height === 'number') {
      const orientation_ = pub.dimensions.width > pub.dimensions.height ? 'landscape' : 'portrait'
      setOrientation(orientation_)
    }
  })

  return {
    publication,
    isMuted,
    isSubscribed,
    track,
    elementProps: () => ({
      ...options.props,
      ...{
        className: mediaTrack().className,
        'data-lk-local-participant': observerOptions.participant.isLocal,
        'data-lk-source': publication()?.source,
        ...(publication()?.kind === 'video' && { 'data-lk-orientation': orientation }),
      },
    }),
  }
}
