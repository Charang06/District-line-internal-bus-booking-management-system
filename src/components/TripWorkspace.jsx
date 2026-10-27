import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { ALL_SEAT_NUMBERS } from '../data/seatLayout'
import SeatMap from './SeatMap'

function emptySeats() {
  return Object.fromEntries(ALL_SEAT_NUMBERS.map((number) => [number, { number, status: 'available', gender: null }]))
}

function readTripDraft(tripId) {
  try {
    return JSON.parse(sessionStorage.getItem(`district-line-trip-draft-${tripId}`) || 'null')
  } catch {
    return null
  }
}

export default function TripWorkspace({ token, trip, formNumber = 1, date, route, permissions = { passengers: true, cargo: true, trips: true }, onEditCrew, onDeleteTrip, onAddBus, onSaved, showMessage, entryFocus }) {
  const passengerFormRef = useRef(null)
  const cargoFormRef = useRef(null)
  const [bookings, setBookings] = useState([])
  const [selectedSeats, setSelectedSeats] = useState(() => readTripDraft(trip.id)?.selectedSeats || [])
  const [bookingError, setBookingError] = useState('')
  const [cargoError, setCargoError] = useState('')
  const [bookingForm, setBookingForm] = useState(() => readTripDraft(trip.id)?.bookingForm || {
    passengerName: '', contact: '', gender: '', from: route.defaultFrom, to: route.defaultTo, fare: '2700', note: '',
  })
  const [cargoForm, setCargoForm] = useState(() => {
    const saved = readTripDraft(trip.id)?.cargoForm || {}
    return {
      goods: saved.goods || '',
      weight: saved.weight || '',
      customerName: saved.customerName ?? saved.senderName ?? '',
      contactNo: saved.contactNo ?? (saved.senderNo || saved.receiverNo || ''),
      fee: saved.fee || '',
      payment: saved.payment || '',
      notes: saved.notes || '',
    }
  })
  const routeStops = route.stops || route.boarding || []

  useEffect(() => {
    setBookingForm((current) => ({
      ...current,
      from: routeStops.includes(current.from) ? current.from : route.defaultFrom,
      to: routeStops.includes(current.to) ? current.to : route.defaultTo,
    }))
  }, [route.code, route.defaultFrom, route.defaultTo, routeStops])

  const loadBookings = useCallback(async () => {
    const data = await api.trip(token, trip.id)
    setBookings((data.bookings || []).filter(Boolean))
  }, [token, trip.id])

  useEffect(() => {
    loadBookings().catch((err) => showMessage(err.message, true))
  }, [loadBookings, showMessage])

  useEffect(() => {
    sessionStorage.setItem(`district-line-trip-draft-${trip.id}`, JSON.stringify({ selectedSeats, bookingForm, cargoForm }))
  }, [trip.id, selectedSeats, bookingForm, cargoForm])

  useEffect(() => {
    if (entryFocus?.tripId !== trip.id) return
    const target = entryFocus.section === 'passenger' ? passengerFormRef.current : cargoFormRef.current
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [entryFocus, trip.id])

  const seatsByNumber = useMemo(() => {
    const seats = emptySeats()
    bookings.filter((booking) => booking.status === 'confirmed').forEach((booking) => {
      seats[booking.seat_number] = {
        number: booking.seat_number,
        status: 'booked',
        gender: booking.gender,
      }
    })
    return seats
  }, [bookings])

  const seatCounts = useMemo(() => {
    const values = Object.values(seatsByNumber)
    return {
      male: values.filter((seat) => seat.status === 'booked' && seat.gender === 'Male').length,
      female: values.filter((seat) => seat.status === 'booked' && seat.gender === 'Female').length,
      free: values.filter((seat) => seat.status === 'available').length,
    }
  }, [seatsByNumber])

  const totalSelectedFare = Number(bookingForm.fare || 0) * selectedSeats.length

  const handleSelectSeat = (seatNumber) => {
    setSelectedSeats((current) => current.includes(seatNumber)
      ? current.filter((seat) => seat !== seatNumber)
      : [...current, seatNumber].sort((a, b) => Number(a) - Number(b)))
  }

  const handleSaveBooking = async () => {
    const passengerName = bookingForm.passengerName.trim()
    const contact = bookingForm.contact.trim()
    const phone = contact.replace(/\s+/g, '').replace(/^\+/, '')
    if (!selectedSeats.length) return setBookingError('Select at least one available seat.')
    if (!passengerName && !contact) return setBookingError('Enter a passenger name or mobile number.')
    if (contact && !/^(0?7\d{8}|94?7\d{8})$/.test(phone)) return setBookingError('Enter a valid Sri Lankan contact number.')
    if (bookingForm.fare === '' || !Number.isFinite(Number(bookingForm.fare)) || Number(bookingForm.fare) < 0) return setBookingError('Enter a valid fare of Rs. 0 or more.')
    setBookingError('')
    try {
      const results = []
      const booking_group_id = globalThis.crypto?.randomUUID?.() || `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`
      for (const seatNumber of selectedSeats) {
        const data = await api.createBooking(token, {
          booking_group_id,
          trip_id: trip.id,
          seat_number: seatNumber,
          passenger_name: passengerName,
          contact,
          gender: bookingForm.gender,
          boarding_point: bookingForm.from,
          destination: bookingForm.to,
          fare: Number(bookingForm.fare),
          notes: bookingForm.note,
        })
        results.push(data.booking)
      }
      showMessage(`Bookings saved: ${results.map((booking) => booking.booking_ref).join(', ')}. SMS stays pending until confirmed in the customer log.`)
      setSelectedSeats([])
      setBookingForm((prev) => ({ ...prev, passengerName: '', contact: '', gender: '', fare: '2700', note: '' }))
      await loadBookings()
      await onSaved(trip)
    } catch (err) {
      setBookingError(err.message)
    }
  }

  const handleSaveCargo = async () => {
    const contactNumber = cargoForm.contactNo.trim().replace(/\s+/g, '').replace(/^\+/, '')
    if (!cargoForm.goods.trim()) return setCargoError('Enter a description of the goods.')
    if (!String(cargoForm.weight).trim() || !Number.isFinite(Number(cargoForm.weight)) || Number(cargoForm.weight) <= 0) return setCargoError('Enter a quantity greater than 0.')
    if (contactNumber && !/^(0?7\d{8}|94?7\d{8})$/.test(contactNumber)) return setCargoError('Enter a valid Sri Lankan contact number.')
    if (cargoForm.fee === '' || !Number.isFinite(Number(cargoForm.fee)) || Number(cargoForm.fee) < 0) return setCargoError('Enter a valid amount of Rs. 0 or more.')
    if (!cargoForm.payment) return setCargoError('Select a payment option.')
    setCargoError('')
    try {
      const data = await api.createCargo(token, {
        trip_id: trip.id,
        sender_name: cargoForm.customerName,
        sender_phone: contactNumber,
        description: cargoForm.goods,
        weight: cargoForm.weight,
        charge: Number(cargoForm.fee),
        payment_status: cargoForm.payment,
        notes: cargoForm.notes,
      })
      showMessage(`Cargo ${data.cargo.cargo_ref} saved.`)
      setCargoForm({ goods: '', weight: '', customerName: '', contactNo: '', fee: '', payment: '', notes: '' })
      await onSaved(trip)
    } catch (err) {
      setCargoError(err.message)
    }
  }

  return (
    <section className="booking-shell trip-workspace">
      <div className="seat-layout">
        <div className="trip-seat-column">
          <div className="booking-header">
            <div className="info-block"><span>Bus No</span><strong>{trip.registration_no || '—'}</strong></div>
            <div className="info-block"><span>Driver</span><strong>{trip.driver_name || '—'}</strong></div>
            <div className="info-block trip-date-block">
              <span>Date</span>
              <strong>{date}</strong>
              <small>Trip No: {trip.trip_code}</small>
            </div>
            <div className="info-block"><span>Conductor</span><strong>{trip.conductor_name || '—'}</strong></div>
            <div className="workspace-actions no-print">
              {onEditCrew ? <button type="button" className="ghost-button small" onClick={() => onEditCrew(trip)}>Add crew details</button> : null}
              {onDeleteTrip ? <button type="button" className="ghost-button small delete-trip-button" onClick={() => onDeleteTrip(trip)}>Delete bus</button> : null}
            </div>
          </div>
          <div className="seat-legend">
            <span className="legend male">Male RSV {seatCounts.male}</span>
            <span className="legend female">Female RSV {seatCounts.female}</span>
            <span className="legend free">Free {seatCounts.free}</span>
            <span className="legend selected">Selected {selectedSeats.length}</span>
          </div>
          <SeatMap seatsByNumber={seatsByNumber} selectedSeats={selectedSeats} onSelect={handleSelectSeat} />
          {onAddBus ? <button type="button" className="primary-button small add-another-bus no-print" onClick={onAddBus}>+ Add another bus</button> : null}
        </div>

        <div className="trip-entry-column">
          {permissions.passengers ? <div className="reservation-panel" ref={passengerFormRef}>
            <div className="panel-header">
              <h2><span className="panel-icon">♙</span> Passenger Reservation</h2>
              <span className="form-badge">Form · P{formNumber}</span>
            </div>
            {bookingError ? <div className="form-validation-message" role="alert">{bookingError}</div> : null}
            <div className="reservation-grid">
              <label><span>Seat no</span><input value={selectedSeats.join(', ') || ''} readOnly /></label>
              <button type="button" className="ghost-button" onClick={() => setSelectedSeats([])}>Clear</button>
            </div>
            <div className="two-col grouped-fields">
              <label><span>Travelling Date</span><input type="date" value={date} readOnly /></label>
              <label><span>Trip Direction</span><input value={route.short} readOnly /></label>
            </div>
            <div className="two-col grouped-fields">
              <label><span>From</span><select value={bookingForm.from} onChange={(event) => setBookingForm((prev) => ({ ...prev, from: event.target.value }))}>{routeStops.map((stop) => <option key={stop} value={stop}>{stop}</option>)}</select></label>
              <label><span>To</span><select value={bookingForm.to} onChange={(event) => setBookingForm((prev) => ({ ...prev, to: event.target.value }))}>{routeStops.map((stop) => <option key={stop} value={stop}>{stop}</option>)}</select></label>
            </div>
            <div className="two-col grouped-fields">
              <label><span>Passenger Name</span><input value={bookingForm.passengerName} onChange={(event) => setBookingForm((prev) => ({ ...prev, passengerName: event.target.value }))} /></label>
              <label><span>Mobile No (optional)</span><input type="tel" value={bookingForm.contact} onChange={(event) => setBookingForm((prev) => ({ ...prev, contact: event.target.value }))} /></label>
            </div>
            <div className="gender-row">
              {['Male', 'Female'].map((gender) => (
                <label key={gender} className="radio-pill">
                  <input type="radio" name={`gender-${trip.id}`} checked={bookingForm.gender === gender} onChange={() => setBookingForm((prev) => ({ ...prev, gender }))} />
                  {gender}
                </label>
              ))}
            </div>
            <div className="fare-row">
              <label><span>Base fare rate (Rs.)</span><input type="number" min="0" step="1" value={bookingForm.fare} onChange={(event) => setBookingForm((prev) => ({ ...prev, fare: event.target.value }))} /></label>
              <label><span>Selected seats</span><input value={selectedSeats.length ? selectedSeats.join(', ') : '—'} readOnly /></label>
            </div>
            <div className="fare-row">
              <label><span>Total Payment</span><input value={totalSelectedFare || '0'} readOnly /></label>
            </div>
            <label><span>Notes</span><textarea value={bookingForm.note} onChange={(event) => setBookingForm((prev) => ({ ...prev, note: event.target.value }))} /></label>
            <div className="reservation-actions">
              <button type="button" className="primary-button" onClick={handleSaveBooking}>Save Passenger booking</button>
            </div>
          </div> : <div className="reservation-panel permission-notice">Passenger booking permission is disabled for your staff account.</div>}

          {permissions.cargo ? <div className="cargo-panel" ref={cargoFormRef}>
            <div className="cargo-header">
              <h3><span className="panel-icon">▣</span> Cargo & Parcel</h3>
              <span className="form-badge">Cargo · B{formNumber}</span>
            </div>
            {cargoError ? <div className="form-validation-message" role="alert">{cargoError}</div> : null}
            <div className="two-col grouped-fields">
              <label><span>Type of goods</span><select required value={cargoForm.goods} onChange={(event) => setCargoForm((prev) => ({ ...prev, goods: event.target.value }))}>
                <option value="">Select goods type</option>
                {['Bike', 'Carton Box', 'Bags', 'Documents', 'Shop Bags', 'House Holds'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select></label>
              <label className="cargo-weight-field"><span>Quantity</span><input type="number" min="0.01" step="any" required value={cargoForm.weight} onChange={(event) => setCargoForm((prev) => ({ ...prev, weight: event.target.value }))} /></label>
            </div>
            <label className="cargo-description-field"><span>Luggage Description / Additional Details</span><textarea value={cargoForm.notes} onChange={(event) => setCargoForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="e.g. 2 sealed cardboard boxes containing garments, handle with care" /></label>
            <div className="two-col grouped-fields">
              <label><span>Customer Name</span><input value={cargoForm.customerName} onChange={(event) => setCargoForm((prev) => ({ ...prev, customerName: event.target.value }))} /></label>
              <label><span>Contact Number (optional)</span><input type="tel" value={cargoForm.contactNo} onChange={(event) => setCargoForm((prev) => ({ ...prev, contactNo: event.target.value }))} /></label>
            </div>
            <div className="two-col grouped-fields cargo-payment-row">
              <label><span>Total Amount</span><input value={cargoForm.fee} onChange={(event) => setCargoForm((prev) => ({ ...prev, fee: event.target.value }))} /></label>
              <div className="cargo-payment-control">
                <span>Payment</span>
                <div className="cargo-payment-options">
                  <label><input type="radio" name={`cargo-payment-${trip.id}`} checked={cargoForm.payment === 'Paid'} onChange={() => setCargoForm((prev) => ({ ...prev, payment: 'Paid' }))} /> Paid</label>
                  <label><input type="radio" name={`cargo-payment-${trip.id}`} checked={cargoForm.payment === 'unpaid'} onChange={() => setCargoForm((prev) => ({ ...prev, payment: 'unpaid' }))} /> Pay on Pickup</label>
                  <label><input type="radio" name={`cargo-payment-${trip.id}`} checked={cargoForm.payment === 'pass'} onChange={() => setCargoForm((prev) => ({ ...prev, payment: 'pass', fee: '0' }))} /> Pass</label>
                </div>
              </div>
            </div>
            <button type="button" className="primary-button" onClick={handleSaveCargo}>Save Goods Booking</button>
          </div> : <div className="cargo-panel permission-notice">Cargo permission is disabled for your staff account.</div>}
        </div>
      </div>
    </section>
  )
}
