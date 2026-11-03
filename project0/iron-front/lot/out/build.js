// Street view of OPERATION: IRON FRONT: the battle loop runs on the world clock, so every viewer sees the
// same tanks firing, the same fire team and the same jet on its strafing runs.
const LOOP = 24

export default function build(b) {
  let started = false
  b.loop((dt, time) => {
    if (!started) { b.play('loop', { loop: true, at: time % LOOP }); started = true }
  })
}
