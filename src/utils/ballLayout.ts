import * as THREE from 'three';

/**
 * Calculates the local origin coordinates of ball `n` (1..15) on the billiards table.
 *
 * Coordinates convention:
 * - Table felt height: y = 0.655
 * - In portrait (`landscape = false`):
 *   - Table is oriented vertically (rotation.y = 0)
 *   - 3 columns (x: -1.78, 0, 1.78) × 5 rows (z: -4.10, -2.05, 0, 2.05, 4.10)
 *   - Row 1 (top): 1, 2, 3
 *   - Row 2: 4, 5, 6
 *   - Row 3: 7, 8, 9
 *   - Row 4: 10, 11, 12
 *   - Row 5 (bottom): 13, 14, 15
 *
 * - In landscape (`landscape = true`):
 *   - Table is rotated 90° (scene.rotation.y = Math.PI / 2)
 *   - World X = local z (left to right on screen)
 *   - World Z = -local x (top to bottom on screen)
 *   - 5 columns (world X: -4.10 to +4.10) × 3 rows (world Z: -1.78 to +1.78)
 *   - Row 1 (top): 1, 2, 3, 4, 5 (left to right)
 *   - Row 2 (middle): 6, 7, 8, 9, 10 (left to right)
 *   - Row 3 (bottom): 11, 12, 13, 14, 15 (left to right)
 */
export function getBallOrigin(n: number, landscape: boolean): THREE.Vector3 {
  if (landscape) {
    const row = Math.floor((n - 1) / 5);
    const col = (n - 1) % 5;
    return new THREE.Vector3((1 - row) * 1.78, 0.655, (col - 2) * 2.05);
  }
  const row = Math.floor((n - 1) / 3);
  const col = (n - 1) % 3;
  return new THREE.Vector3((col - 1) * 1.78, 0.655, (row - 2) * 2.05);
}
