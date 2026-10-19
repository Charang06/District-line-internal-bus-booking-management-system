import { SEAT_LAYOUT } from '../data/seatLayout'

function seatClass(seat, selectedId) {
  const classes = ['seat']
  if (selectedId === seat.number) classes.push('selected')
  else if (seat.status === 'available') classes.push('available', 'seat-free')
  else if (seat.gender === 'Female') classes.push('booked', 'seat-female')
  else classes.push('booked')
  return classes.join(' ')
}

function SeatButton({ seat, selectedSeats, onSelect }) {
  const isSelected = selectedSeats.includes(seat.number)
  const disabled = seat.status !== 'available'
  const tag = isSelected ? 'SEL' : seat.status === 'available' ? 'FREE' : 'RSV'
  return (
    <button
      type="button"
      className={seatClass(seat, isSelected ? seat.number : '')}
      disabled={disabled}
      onClick={() => {
        if (seat.status !== 'available') return
        onSelect(seat.number)
      }}
    >
      <strong>{seat.number}</strong>
      <small>{tag}</small>
    </button>
  )
}

export default function SeatMap({ seatsByNumber, selectedSeats, onSelect }) {
  return (
    <div className="seat-panel">
      <div className="panel-topline">
        <div className="panel-title"><span className="entry-icon">⇩</span> Entry</div>
        <div className="driver-chip">Driver <span>☻</span></div>
      </div>
      <div className="seat-deck">
        {SEAT_LAYOUT.pairRows.map((row) => (
          <div className="seat-row" key={row.aisle}>
            <div className="seat-pair">
              {[...row.left].reverse().map((number) => (
                <SeatButton key={number} seat={seatsByNumber[number]} selectedSeats={selectedSeats} onSelect={onSelect} />
              ))}
            </div>
            <div className="aisle-index">{row.aisle} ..</div>
            <div className="seat-pair">
              {row.right.map((number) => (
                <SeatButton key={number} seat={seatsByNumber[number]} selectedSeats={selectedSeats} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
        <div className="rear-row">
          {SEAT_LAYOUT.rearRow.map((number) => (
            <SeatButton key={number} seat={seatsByNumber[number]} selectedSeats={selectedSeats} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}
