const money = value => `Rs. ${Number(value || 0).toLocaleString('en-US')}`
const categories = ['Fuel', 'Driver allowance', 'Conductor allowance', 'Driver wage', 'Conductor wage', 'Driver salary', 'Conductor salary', 'Maintenance', 'Toll / parking charge', 'Other expenses', 'Supplies', 'Salaries', 'Tolls', 'Other']

// Uses the existing duty mutation handlers and server calculations.
export default function AccountsDuties({ duties, selectedDuty, onSelect, form, setForm, firstTrips, returnTrips, buses, expense, setExpense, adjustment, setAdjustment, saving, onCreate, onExpense, onAdjustment, onDelete, setFinalizeTarget, setAcknowledged }) {
  const change = (setter, field) => event => setter(current => ({ ...current, [field]: event.target.value }))
  const tripOptions = trips => trips.map(trip => <option key={trip.id} value={trip.id}>{trip.trip_code} · {trip.travel_date} · {trip.route_label || trip.route_code}</option>)
  const journeys = selectedDuty ? [selectedDuty.first_trip, selectedDuty.return_trip] : []
  const mutable = selectedDuty && selectedDuty.status !== 'finalized'
  const completed = journeys.length === 2 && journeys.every(trip => trip.status === 'completed')
  return <section className="content-card accounts-duty-panel" aria-labelledby="accounts-duties-title">
    <h2 id="accounts-duties-title">Bus duties</h2>
    <p>Review stored duty records and manage their financial entries. Finalized duties are locked.</p>
    <form onSubmit={onCreate} className="accounts-trip-details">
      <label>Duty bus<select required value={form.bus_no} onChange={event => setForm({ bus_no: event.target.value, first_trip_id: '', return_trip_id: '' })}><option value="">Select bus</option>{buses.map(bus => <option key={bus}>{bus}</option>)}</select></label>
      <label>First journey<select required value={form.first_trip_id} onChange={event => setForm(current => ({ ...current, first_trip_id: event.target.value, return_trip_id: '' }))}><option value="">Select first journey</option>{tripOptions(firstTrips)}</select></label>
      <label>Return journey<select required value={form.return_trip_id} onChange={change(setForm, 'return_trip_id')}><option value="">Select later opposite-direction journey</option>{tripOptions(returnTrips)}</select></label>
      <button type="submit" className="primary-button" disabled={saving}>Create duty</button>
    </form>
    <label>Review duty<select value={selectedDuty?.id || ''} onChange={event => onSelect(Number(event.target.value) || null)}><option value="">Select duty</option>{duties.map(duty => <option key={duty.id} value={duty.id}>{duty.duty_code} · {duty.bus_no} · {duty.status}</option>)}</select></label>
    {selectedDuty && <>
      <p>{selectedDuty.first_trip.travel_date} — {selectedDuty.return_trip.travel_date}: revenue {money(selectedDuty.total_revenue)}, expenses {money(selectedDuty.total_expenses)}, net profit {money(selectedDuty.net_profit)}.</p>
      <div className="daily-revenue-table-wrap"><table><caption>Duty expenses and adjustments</caption><thead><tr><th>Date</th><th>Kind</th><th>Description</th><th>Amount</th><th>Action</th></tr></thead><tbody>
        {[...selectedDuty.expenses.map(row => ({ ...row, kind: 'expense' })), ...selectedDuty.adjustments.map(row => ({ ...row, kind: 'adjustment' }))].map(row => <tr key={`${row.kind}-${row.id}`}><td>{row.expense_date || row.adjustment_date}</td><td>{row.category || row.type}</td><td>{row.description}</td><td>{money(row.amount)}</td><td>{mutable && <button type="button" disabled={saving} onClick={() => onDelete(row)}>Delete entry</button>}</td></tr>)}
      </tbody></table></div>
      {mutable && <fieldset disabled={saving}>
        <legend>Duty financial management</legend>
        <form onSubmit={onExpense} className="accounts-trip-details">
          <label>Expense date<input required type="date" value={expense.expense_date} onChange={change(setExpense, 'expense_date')} /></label>
          <label>Category<select value={expense.category} onChange={change(setExpense, 'category')}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
          <label>Expense journey<select value={expense.trip_id} onChange={change(setExpense, 'trip_id')}><option value="">Whole duty</option>{tripOptions(journeys)}</select></label>
          <label>Description<input required maxLength={240} value={expense.description} onChange={change(setExpense, 'description')} /></label>
          <label>Expense amount<input required type="number" min="1" step="1" value={expense.amount} onChange={change(setExpense, 'amount')} /></label>
          <button type="submit" className="primary-button">Add duty expense</button>
        </form>
        <form onSubmit={onAdjustment} className="accounts-trip-details">
          <label>Adjustment date<input required type="date" value={adjustment.adjustment_date} onChange={change(setAdjustment, 'adjustment_date')} /></label>
          <label>Type<select value={adjustment.type} onChange={change(setAdjustment, 'type')}><option value="other_income">Other income</option><option value="cancellation_fee">Cancellation fee</option><option value="refund">Refund</option></select></label>
          <label>Adjustment journey<select value={adjustment.trip_id} onChange={change(setAdjustment, 'trip_id')}><option value="">Whole duty</option>{tripOptions(journeys)}</select></label>
          <label>Seat reference<input maxLength={12} value={adjustment.seat_number} onChange={change(setAdjustment, 'seat_number')} /></label>
          <label>Description<input required maxLength={240} value={adjustment.description} onChange={change(setAdjustment, 'description')} /></label>
          <label>Adjustment amount<input required type="number" min="1" step="1" value={adjustment.amount} onChange={change(setAdjustment, 'amount')} /></label>
          <button type="submit" className="primary-button">Add duty adjustment</button>
        </form>
        <button type="button" className="primary-button" disabled={!completed} onClick={() => { setAcknowledged(false); setFinalizeTarget(selectedDuty) }}>Review and finalize duty</button>
        {!completed && <p>Both journeys must be completed before finalization.</p>}
      </fieldset>}
    </>}
  </section>
}
