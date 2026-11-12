// Compile/render only this presentational component; no app startup, DB or browser.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
for(const key of Object.keys(process.env))if(key.startsWith('VITE_'))delete process.env[key]
const {build}=await import('vite')
const result=await build({envDir:false,publicDir:false,build:{ssr:'src/components/AccountsDuties.jsx',write:false,emptyOutDir:false,minify:false}})
const code=result.output.find(row=>row.type==='chunk').code
const context=vm.createContext({console})
const module=new vm.SourceTextModule(code,{context})
await module.link(specifier=>{
 const namespace=specifier==='react/jsx-runtime'?jsx:specifier==='react'?React:null
 assert.ok(namespace,'Unexpected SSR dependency: '+specifier)
 return new vm.SyntheticModule(Object.keys(namespace),function(){for(const key of Object.keys(namespace))this.setExport(key,namespace[key])},{context})
})
await module.evaluate()
const Component=module.namespace.default
const trip={id:11,trip_code:'TRIP-SYNTHETIC',travel_date:'2026-11-12',route_label:'Synthetic corridor',status:'completed'}
const duty={id:1,duty_code:'DUTY-SYNTHETIC',bus_no:'SYNTHETIC',status:'in_progress',first_trip:trip,return_trip:{...trip,id:12},total_revenue:200,total_expenses:25,net_profit:175,expenses:[],adjustments:[]}
const noop=()=>{},create=()=>{},expense=()=>{},adjustment=()=>{}
const props={duties:[duty],selectedDuty:duty,onSelect:noop,form:{bus_no:'SYNTHETIC',first_trip_id:'11',return_trip_id:'12'},setForm:noop,firstTrips:[trip],returnTrips:[{...trip,id:12}],buses:['SYNTHETIC'],expense:{expense_date:'2026-11-12',category:'Fuel',trip_id:'',description:'Fuel',amount:'25'},setExpense:noop,adjustment:{adjustment_date:'2026-11-12',type:'other_income',trip_id:'',seat_number:'',description:'Other',amount:'10'},setAdjustment:noop,saving:false,onCreate:create,onExpense:expense,onAdjustment:adjustment,onDelete:noop,setFinalizeTarget:noop,setAcknowledged:noop}
const flatten=node=>node==null||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flatten):[node,...flatten(node.props?.children)]
const tree=Component(props),nodes=flatten(tree)
assert.deepEqual(nodes.filter(n=>n.type==='form').map(n=>n.props.onSubmit),[create,expense,adjustment])
const finalize=nodes.find(n=>n.type==='button'&&n.props.children==='Review and finalize duty');assert.equal(finalize.props.disabled,false)
const incomplete=flatten(Component({...props,selectedDuty:{...duty,return_trip:{...trip,status:'scheduled'}}}));assert.equal(incomplete.find(n=>n.type==='button'&&n.props.children==='Review and finalize duty').props.disabled,true)
const locked=renderToStaticMarkup(React.createElement(Component,{...props,selectedDuty:{...duty,status:'finalized'}}))
assert.ok(!locked.includes('Add duty expense'));assert.ok(!locked.includes('Add duty adjustment'));assert.ok(!locked.includes('Review and finalize duty'))
assert.ok(locked.includes('175'))
console.log('ACCOUNTS_DUTY_RENDER_PASS')
