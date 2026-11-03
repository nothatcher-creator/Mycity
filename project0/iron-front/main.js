// OPERATION: IRON FRONT - a military sandbox on the island of Varden, for Project 0.
// Entry point: builds the island while the loading screen runs, then hands over to the game.
import { Game } from './src/game/game.js'

export default async function start(p0) {
  p0.controls.mode = 'none'
  p0.controls.vertical = false
  p0.bodies.visible = false
  const game = new Game(p0)
  await game.boot()
}
