import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getBallOrigin } from '../utils/ballLayout';

describe('ballLayout', () => {
  describe('portrait mode (窄屏竖屏: 3列 x 5行)', () => {
    it('should arrange 15 balls in 5 rows of 3, increasing left-to-right and top-to-bottom', () => {
      const origins: THREE.Vector3[] = [];
      for (let n = 1; n <= 15; n++) {
        origins.push(getBallOrigin(n, false));
      }

      // Height should be felt height 0.655
      for (const origin of origins) {
        expect(origin.y).toBeCloseTo(0.655);
      }

      // Row 1: balls 1, 2, 3
      expect(origins[0].z).toBeCloseTo(origins[1].z);
      expect(origins[1].z).toBeCloseTo(origins[2].z);
      expect(origins[0].x).toBeLessThan(origins[1].x);
      expect(origins[1].x).toBeLessThan(origins[2].x);

      // Row 2: balls 4, 5, 6
      expect(origins[3].z).toBeCloseTo(origins[4].z);
      expect(origins[4].z).toBeCloseTo(origins[5].z);
      expect(origins[3].x).toBeLessThan(origins[4].x);
      expect(origins[4].x).toBeLessThan(origins[5].x);

      // Top to bottom (Z increases as you go down towards camera)
      expect(origins[0].z).toBeLessThan(origins[3].z); // row 1 to row 2
      expect(origins[3].z).toBeLessThan(origins[6].z); // row 2 to row 3
      expect(origins[6].z).toBeLessThan(origins[9].z); // row 3 to row 4
      expect(origins[9].z).toBeLessThan(origins[12].z); // row 4 to row 5
    });
  });

  describe('landscape mode (PC宽屏: 3行 x 5列 Option A)', () => {
    it('should arrange 15 balls in 3 rows of 5, increasing left-to-right and top-to-bottom on screen', () => {
      // Under scene.rotation.y = Math.PI / 2:
      // World X (screen left-to-right) = local z
      // World Z (screen top-to-bottom) = -local x
      const toScreenCoords = (local: THREE.Vector3) => ({
        screenX: local.z,
        screenY: -local.x,
      });

      const balls = Array.from({ length: 15 }, (_, i) => {
        const n = i + 1;
        const local = getBallOrigin(n, true);
        return { n, ...toScreenCoords(local) };
      });

      // Row 1 (top): balls 1, 2, 3, 4, 5
      const row1 = balls.slice(0, 5);
      expect(row1.map((b) => b.n)).toEqual([1, 2, 3, 4, 5]);
      for (let i = 0; i < 4; i++) {
        expect(row1[i].screenY).toBeCloseTo(row1[i + 1].screenY);
        expect(row1[i].screenX).toBeLessThan(row1[i + 1].screenX);
      }

      // Row 2 (middle): balls 6, 7, 8, 9, 10
      const row2 = balls.slice(5, 10);
      expect(row2.map((b) => b.n)).toEqual([6, 7, 8, 9, 10]);
      for (let i = 0; i < 4; i++) {
        expect(row2[i].screenY).toBeCloseTo(row2[i + 1].screenY);
        expect(row2[i].screenX).toBeLessThan(row2[i + 1].screenX);
      }

      // Row 3 (bottom): balls 11, 12, 13, 14, 15
      const row3 = balls.slice(10, 15);
      expect(row3.map((b) => b.n)).toEqual([11, 12, 13, 14, 15]);
      for (let i = 0; i < 4; i++) {
        expect(row3[i].screenY).toBeCloseTo(row3[i + 1].screenY);
        expect(row3[i].screenX).toBeLessThan(row3[i + 1].screenX);
      }

      // Top to bottom (screenY increases down the screen)
      expect(row1[0].screenY).toBeLessThan(row2[0].screenY);
      expect(row2[0].screenY).toBeLessThan(row3[0].screenY);
    });
  });
});
