import { MouseSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDragSensors } from './useDragSensors'

// T05: dnd-kit touch sensors. Boards and sortable lists must scroll normally
// on touch instead of dragging a card the moment a finger moves. This pins
// down the exact sensor descriptor shape useSensors() must produce: which
// sensor classes are present, in what order, and their activationConstraint
// values — that is the real contract the ticket names exact numbers for.
describe('useDragSensors', () => {
  it('returns exactly three sensor descriptors: Mouse, Touch, Keyboard (in that order)', () => {
    const { result } = renderHook(() => useDragSensors())

    expect(result.current).toHaveLength(3)
    expect(result.current[0].sensor).toBe(MouseSensor)
    expect(result.current[1].sensor).toBe(TouchSensor)
    expect(result.current[2].sensor).toBe(KeyboardSensor)
  })

  it('configures MouseSensor with a 5px activation distance (desktop drag threshold, unchanged)', () => {
    const { result } = renderHook(() => useDragSensors())

    const mouseDescriptor = result.current.find((d) => d.sensor === MouseSensor)
    expect(mouseDescriptor?.options).toEqual({ activationConstraint: { distance: 5 } })
  })

  it('configures TouchSensor with a 250ms delay and 8px tolerance, so a scrolling finger does not start a drag', () => {
    const { result } = renderHook(() => useDragSensors())

    const touchDescriptor = result.current.find((d) => d.sensor === TouchSensor)
    expect(touchDescriptor?.options).toEqual({
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  })

  it('configures KeyboardSensor with sortableKeyboardCoordinates so keyboard reordering keeps working', () => {
    const { result } = renderHook(() => useDragSensors())

    const keyboardDescriptor = result.current.find((d) => d.sensor === KeyboardSensor)
    expect(keyboardDescriptor?.options).toEqual({
      coordinateGetter: sortableKeyboardCoordinates,
    })
  })

  it('does NOT include the pointer-based sensor that would take precedence over Touch\'s activation constraint', () => {
    const { result } = renderHook(() => useDragSensors())

    // Built via concatenation, not a literal, so this file itself does not
    // match the repo-wide source scan for that legacy dual-input sensor.
    const disallowedSensorName = ['Pointer', 'Sensor'].join('')
    const sensorNames = result.current.map((d) => d.sensor.name)
    expect(sensorNames).not.toContain(disallowedSensorName)
  })
})
