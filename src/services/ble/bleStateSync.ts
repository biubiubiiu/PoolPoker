/**
 * BLE Transport State Synchronization Module
 *
 * Manages:
 * 1. Chunk reassembly for state downlink and command uplink
 * 2. Host desensitized state distribution and peer unicast
 * 3. Guest local optimistic state execution (0ms card pocket & 3D animation)
 * 4. State decoding, desensitization, and action overlay
 */

import { BLE_PROTOCOL_VERSION, BleActionType, type BleClientAction, BleHostEventCode } from '@shared/types/bleProtocol';
import type { Room } from '@shared/types/game';
import {
  BleChunkReassembler,
  bleStateToClientRoom,
  decodeBleRoomState,
  encodeBleHostEvent,
} from '@shared/utils/bleCodec';
import { getRandomHex, getRandomUUID } from '@shared/utils/crypto';
import type { LocalHostEngine } from '../localHostEngine';

export class BleStateSync {
  // Downlink chunk reassembler (Guest)
  public stateReassembler = new BleChunkReassembler();
  // Uplink chunk reassemblers keyed by peerId (Host)
  public commandReassemblers = new Map<string, BleChunkReassembler>();

  public processIncomingState(rawBytes: Uint8Array): Uint8Array | null {
    return this.stateReassembler.processPacket(rawBytes);
  }

  public processIncomingCommand(peerId: string, rawBytes: Uint8Array): Uint8Array | null {
    let reassembler = this.commandReassemblers.get(peerId);
    if (!reassembler) {
      reassembler = new BleChunkReassembler();
      this.commandReassemblers.set(peerId, reassembler);
    }
    return reassembler.processPacket(rawBytes);
  }

  public removePeerReassembler(peerId: string): void {
    this.commandReassemblers.delete(peerId);
  }

  public resetReassemblers(): void {
    this.stateReassembler.reset();
    this.commandReassemblers.clear();
  }

  public bindHostEngineCallback(
    engine: LocalHostEngine,
    selfUserId: string,
    userIdToPeerId: Map<string, string>,
    onLocalState: (clientRoom: Room) => void,
    notifyClientFn: (bytes: Uint8Array, targetPeerId: string) => void
  ): void {
    engine.setStateUpdateCallback((targetUserId, stateBytes, clientRoom) => {
      if (targetUserId === selfUserId) {
        // Host local player view: zero-copy direct update, never send to BLE
        onLocalState(clientRoom);
        return;
      }

      // Guest: find corresponding peerId and unicast tailored desensitized state
      const targetPeerId = userIdToPeerId.get(targetUserId) || targetUserId;
      notifyClientFn(stateBytes, targetPeerId);
    });
  }

  public createKickEventBytes(roomCode: string): Uint8Array {
    return encodeBleHostEvent({
      version: BLE_PROTOCOL_VERSION,
      code: BleHostEventCode.KICKED,
      roomCode: Number(roomCode) || 8848,
    });
  }

  public decodeAndConvertRoomState(
    bytes: Uint8Array,
    selfUserId: string,
    roomCode: string,
    playerName: string
  ): { clientRoom: Room; selfSeatNeedsSync: boolean } {
    const bleState = decodeBleRoomState(bytes);
    const selfSeatNeedsSync =
      bleState.selfSeatIndex !== undefined &&
      bleState.selfSeatIndex < bleState.players.length &&
      bleState.players[bleState.selfSeatIndex]?.name === '蓝牙球友' &&
      playerName !== '蓝牙球友';

    const clientRoom = bleStateToClientRoom(bleState, selfUserId, roomCode, playerName);
    return { clientRoom, selfSeatNeedsSync };
  }

  /**
   * Guest local optimistic state execution (instant card elimination & ball pocketing)
   */
  public applyLocalOptimisticAction(
    action: BleClientAction,
    targetRoom: Room | null,
    selfUserId: string,
    cachedRoom?: Room | null
  ): Room | null {
    const room = targetRoom || (cachedRoom ? (JSON.parse(JSON.stringify(cachedRoom)) as Room) : null);
    if (!room) return null;

    let ballNumber = action.ballNumber;
    const actorUserId = selfUserId;
    const selfPlayer = room.players.find((p) => p.userId === actorUserId);

    if (action.actionType === BleActionType.POCKET_BALL) {
      if (selfPlayer) {
        let card = action.cardId ? selfPlayer.cards.find((c) => c.id === action.cardId) : undefined;
        if (!card && ballNumber !== undefined) {
          card = selfPlayer.cards.find((c) => c.ballNumber === ballNumber);
        }
        if (card) {
          ballNumber = card.ballNumber;
          const targetCardId = card.id;
          selfPlayer.cards = selfPlayer.cards.filter((c) => c.id !== targetCardId);
          if (!selfPlayer.pocketedCards.some((c) => c.id === targetCardId)) {
            selfPlayer.pocketedCards.push(card);
          }
          selfPlayer.cardCount = selfPlayer.cards.length;
        }
      }
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
      }
      if (selfPlayer && ballNumber !== undefined) {
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎯 ${selfPlayer.name} 打进 ${ballNumber}号球，消去对应卡牌`,
        });
      }
    } else if (action.actionType === BleActionType.REFEREE_POCKET) {
      const targetUserId =
        action.targetUserId ||
        (action.targetSeatIndex !== undefined && room.players[action.targetSeatIndex]
          ? room.players[action.targetSeatIndex].userId
          : undefined) ||
        actorUserId;
      const targetPlayer = room.players.find((p) => p.userId === targetUserId);
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
      }
      if (targetPlayer) {
        if (targetPlayer.cards.length > 0) {
          const cardIdx = targetPlayer.cards.findIndex((c) => c.ballNumber === ballNumber);
          if (cardIdx !== -1) {
            const [pocketedCard] = targetPlayer.cards.splice(cardIdx, 1);
            targetPlayer.pocketedCards.push(pocketedCard);
          }
        }
        targetPlayer.cardCount = Math.max(0, targetPlayer.cardCount - 1);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `⚖️ 裁判代记：${targetPlayer.name} 打进 ${ballNumber}号球`,
        });
      }
    } else if (action.actionType === BleActionType.BREAK_POCKET) {
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎱 开球进球：${ballNumber}号球落袋`,
        });
      }
    } else if (action.actionType === BleActionType.ACCIDENTAL_POCKET) {
      if (ballNumber !== undefined && !room.pocketedBallNumbers.includes(ballNumber)) {
        room.pocketedBallNumbers.push(ballNumber);
        room.pocketedBallNumbers.sort((a, b) => a - b);
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `🎱 事故球：${ballNumber}号球误进`,
        });
      }
    } else if (
      action.actionType === BleActionType.DRAW_PENALTY ||
      action.actionType === BleActionType.REFEREE_PENALTY
    ) {
      const targetUserId = action.targetUserId || actorUserId;
      const targetPlayer = room.players.find((p) => p.userId === targetUserId);
      if (targetPlayer) {
        targetPlayer.cardCount += 1;
        const time = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        room.logs.push({
          id: `${Date.now()}_${getRandomHex(3)}`,
          time,
          text: `⚠️ ${targetPlayer.name} 犯规，罚抽 1 张扑克牌`,
        });
      }
    }

    // Determine win conditions
    const pocketedSet = new Set(room.pocketedBallNumbers);
    let hasWinner = false;
    for (const p of room.players) {
      if (p.cards.length > 0) {
        const activeCards = p.cards.filter((c) => !pocketedSet.has(c.ballNumber));
        if (activeCards.length === 0) {
          p.isWinner = true;
          hasWinner = true;
          if (!room.winners.some((w) => w.userId === p.userId)) {
            room.winners.push({
              id: p.id,
              userId: p.userId,
              name: p.name,
              wins: (p.wins || 0) + 1,
            });
          }
        }
      }
    }
    if (hasWinner) {
      room.status = 'finished';
    }

    room.revision = (room.revision || 0) + 1;
    if (ballNumber !== undefined) {
      room.sceneEvent = {
        id: getRandomUUID(),
        kind: 'pocket_ball',
        revision: room.revision,
        targetUserId: action.targetUserId || actorUserId,
        ballNumber,
      };
    }

    if (room.logs.length > 50) {
      room.logs = room.logs.slice(-50);
    }

    return room;
  }
}
