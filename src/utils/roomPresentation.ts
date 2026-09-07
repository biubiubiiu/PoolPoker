import type { Room } from '@shared/types/game';

type PresentationIdentity = Pick<Room, 'code' | 'roundCount' | 'revision' | 'sceneEvent'>;

/** Snapshots establish a baseline; only a new, live server event is performed. */
export function shouldAnimateRoomChange(
  previous: PresentationIdentity | null,
  next: PresentationIdentity,
  context: { live: boolean; suppress: boolean; visible: boolean }
): boolean {
  return !!(
    context.live &&
    !context.suppress &&
    context.visible &&
    previous &&
    previous.code === next.code &&
    previous.roundCount === next.roundCount &&
    next.sceneEvent &&
    next.sceneEvent.id !== previous.sceneEvent?.id &&
    (next.revision ?? 0) > (previous.revision ?? 0)
  );
}
