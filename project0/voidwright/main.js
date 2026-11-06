// VOIDWRIGHT - an open star system to build in: ships and stations of blocks, landable planets and
// asteroids, for Project 0. Entry point: boots the game while the loading screen runs.
import { Game } from './src/game/game.js'

export default async function start(p0) {
  p0.controls.mode = 'none'
  p0.controls.vertical = false
  p0.bodies.visible = false
  const game = new Game(p0)
  await game.boot()
}
