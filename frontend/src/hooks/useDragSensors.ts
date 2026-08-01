import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

// T05: dnd-kit touch sensors. MouseSensor + TouchSensor are used together
// instead of the combined mouse/touch sensor, so the touch activation
// constraint (delay, tolerance) actually applies: that other sensor handles
// both input types and takes precedence, which would otherwise defeat
// TouchSensor's constraint.
export function useDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}
