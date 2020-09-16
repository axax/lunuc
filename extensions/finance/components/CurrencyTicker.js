import React from 'react'
import PropTypes from 'prop-types'
import styles from './style.css'
import Async from '../../../client/components/Async'
import {client} from '../../../client/middleware/graphql'

const Card = (props) => <Async {...props} expose="Card"
                               load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>


class CurrencyTicker extends React.Component {

    timeout = null
    stop = false
    constructor(props) {
        super(props)
        this.state = {currencyData:null}

    }

    getData(){
        client.query({
            fetchPolicy: 'network-only',
            query: `query currencyData($from: String!, $to: String!){ currencyData(from: $from, to: $to){to from toName fromName rate timestamp}}`,
            variables: {
                from: this.props.from,
                to: this.props.to
            }
        }).then(response => {
            if(!this.stop) {
                this.setState(response.data)
                setTimeout(() => {
                    this.getData()
                }, 1000 * 60)
            }
        }).catch((err)=>{
            console.log(err)
        })
    }
    componentDidMount() {
        this.stop = false
        this.getData()
    }

    componentWillUnmount() {
        this.stop = true
        clearTimeout(this.timeout)
    }

    shouldComponentUpdate(nextProps, state) {
        if( !state.currencyData || !this.state.currencyData ) return true

        return this.state.currencyData.rate!=state.currencyData.rate
    }


    render() {
        const {currencyData} = this.state
        return <Card>{currencyData ?
            <div key={Math.random()} className="CurrencyTicker-highlight"><h2>{currencyData.from} / {currencyData.to}</h2>{currencyData.rate}</div> : 'no rate'}</Card>
    }
}

CurrencyTicker.propTypes = {
    from: PropTypes.string.isRequired,
    to: PropTypes.string.isRequired
}


export default CurrencyTicker




