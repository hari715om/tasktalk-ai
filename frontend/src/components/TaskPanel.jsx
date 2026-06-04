import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import { ListTodo, Clock } from 'lucide-react'

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${ampm}` : `${hour} ${ampm}`
}

function formatDateLabel(dateStr) {
  if (!dateStr) return 'Someday'
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function TaskPanel() {
  const { tasks, highlightedTaskId } = useStore()

  // Group by date
  const grouped = useMemo(() => {
    const map = {}
    const pending = tasks.filter((t) => t.status === 'pending')
    pending.forEach((task) => {
      const key = task.task_date || '__nodate__'
      if (!map[key]) map[key] = []
      map[key].push(task)
    })
    // Sort groups by date
    return Object.entries(map).sort(([a], [b]) => {
      if (a === '__nodate__') return 1
      if (b === '__nodate__') return -1
      return a.localeCompare(b)
    })
  }, [tasks])

  return (
    <div className="task-panel">
      <div className="task-panel-header">
        <span className="task-panel-title">Tasks</span>
        <span className="task-count-badge">
          {tasks.filter((t) => t.status === 'pending').length}
        </span>
      </div>

      <div className="task-list">
        {grouped.length === 0 ? (
          <div className="task-empty">
            <div className="task-empty-icon"><ListTodo size={24} /></div>
            <p className="task-empty-text">
              No tasks yet.<br />
              Say <em>"Create a task…"</em> to get started.
            </p>
          </div>
        ) : (
          grouped.map(([dateKey, dateTasks]) => (
            <div key={dateKey}>
              <div className="task-group-label">
                {dateKey === '__nodate__' ? 'No date' : formatDateLabel(dateKey)}
              </div>
              <div className="task-group-items">
                {dateTasks
                  .sort((a, b) => (a.task_time || '').localeCompare(b.task_time || ''))
                  .map((task) => (
                    <div
                      key={task.id}
                      className={`task-item${task.id === highlightedTaskId ? ' highlight' : ''}`}
                    >
                      <div className={`task-item-dot priority-${task.priority}`} />
                      <div className="task-item-body">
                        <div className="task-item-header">
                          <div className="task-item-title">{task.title}</div>
                          {task.priority && task.priority !== 'none' && (
                            <span className={`task-priority-capsule priority-${task.priority}`}>
                              {task.priority}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <div className="task-item-desc">{task.description}</div>
                        )}
                        <div className="task-item-meta">
                          {task.task_time && (
                            <div className="task-item-time">
                              <span className="time-icon"><Clock size={12} /></span> {formatTime(task.task_time)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
