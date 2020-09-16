import React from 'react'
import PropTypes from 'prop-types'
import styles from './style.css'
import Async from '../../../client/components/Async'
import {client} from '../../../client/middleware/graphql'

const Card = (props) => <Async {...props} expose="Card"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>

class StockTicker extends React.Component {

    timeout = null
    stop = false

    constructor(props) {

        super(props)
        this.state = {stockData:null}
    }



    getData(){
        client.query({
            fetchPolicy: 'network-only',
            query: 'query stockData($symbols: [String]!){ stockData(symbols: $symbols){price symbol volume timestamp}}',
            variables: {
                symbols: this.props.symbols
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

    shouldComponentUpdate(nextProps, nextState) {
        if( !nextState.stockData || !this.state.nextState ) return true

        return this.state.stockData.rate!=nextState.stockData.rate
    }

    render() {
        const {stockData} = this.state

        return stockData && stockData.map(d => <Card key={d.symbol}>
                <div key={Math.random()} className="StockTicker-highlight"><h2>{d.symbol}</h2> {d.price}</div>
            </Card>) || null
    }
}

StockTicker.propTypes = {
    symbols: PropTypes.array.isRequired
}

export default StockTicker




