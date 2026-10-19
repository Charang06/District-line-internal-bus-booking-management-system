/** Seat numbering follows the physical seat map layout shown in the reference design. */
export const SEAT_LAYOUT_ID = 'super-luxury-49-sleeper'

export const SEAT_LAYOUT = {
  id: SEAT_LAYOUT_ID,
  name: 'Super Luxury 49-Sleeper',
  totalSeats: 49,
  entry: 'left-front',
  driver: 'right-front',
  pairRows: [
    { aisle: 1, left: ['03', '04'], right: ['01', '02'] },
    { aisle: 2, left: ['07', '08'], right: ['05', '06'] },
    { aisle: 3, left: ['11', '12'], right: ['09', '10'] },
    { aisle: 4, left: ['15', '16'], right: ['13', '14'] },
    { aisle: 5, left: ['19', '20'], right: ['17', '18'] },
    { aisle: 6, left: ['23', '24'], right: ['21', '22'] },
    { aisle: 7, left: ['27', '28'], right: ['25', '26'] },
    { aisle: 8, left: ['31', '32'], right: ['29', '30'] },
    { aisle: 9, left: ['35', '36'], right: ['33', '34'] },
    { aisle: 10, left: ['39', '40'], right: ['37', '38'] },
    { aisle: 11, left: ['43', '44'], right: ['41', '42'] },
  ],
  rearRow: ['49', '48', '47', '45', '46'],
}

export const ALL_SEAT_NUMBERS = [
  ...SEAT_LAYOUT.pairRows.flatMap((row) => [...row.left, ...row.right]),
  ...SEAT_LAYOUT.rearRow,
]

export const ROUTES = [
  {
    code: 'KTY_CMB',
    label: 'Kattankudy to Colombo',
    short: 'KKY to CMB',
    via: 'Via Kalmunai • Batticaloa • Polonnaruwa • Kurunegala Express',
    defaultFrom: 'Kattankudy Central',
    defaultTo: 'Colombo',
    boarding: ['Kattankudy Central', 'Kattankudy', 'Kalmunai', 'Batticaloa', 'Polonnaruwa', 'Kurunegala', 'Maradana'],
    alighting: ['Colombo', 'Colombo Fort', 'Pettah Central', 'Dehiwala', 'Maradana'],
  },
  {
    code: 'CMB_KTY',
    label: 'Colombo to Kattankudy',
    short: 'CMB to KKY',
    via: 'Via Maradana Terminal • Fort • Dambulla • Batticaloa',
    defaultFrom: 'Colombo',
    defaultTo: 'Kattankudy Central',
    boarding: ['Colombo', 'Colombo Fort', 'Pettah Central', 'Dehiwala', 'Maradana', 'Dambulla'],
    alighting: ['Kattankudy Central', 'Kattankudy', 'Kalmunai', 'Batticaloa', 'Polonnaruwa', 'Kurunegala'],
  },
]

export function routeByCode(code) {
  return ROUTES.find((route) => route.code === code) || ROUTES[0]
}
