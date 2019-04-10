import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {Card} from 'ui/admin'
import styles from './style.css'

class StockTicker extends React.Component {

    interval = null

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        this.interval = setInterval(() => {
            this.props.refetch()
        }, 1000*60)
    }


    componentWillUnmount() {
        clearInterval(this.interval)
    }

    shouldComponentUpdate(nextProps) {
        if( !nextProps.stockData || !this.props.stockData ) return true

        return this.props.stockData.rate!=nextProps.stockData.rate
    }

    render() {
        const {stockData} = this.props

        return stockData && stockData.map(d => <Card key={d.symbol}>
                <div key={Math.random()} className="StockTicker-highlight"><h2>{d.symbol}</h2> {d.price}</div>
            </Card>) || null
    }
}

StockTicker.propTypes = {
    symbols: PropTypes.array.isRequired,
    stockData: PropTypes.array,
    refetch: PropTypes.func,
    loading: PropTypes.bool
}


const gqlQuery = gql`query stockData($symbols: [String]!){ stockData(symbols: $symbols){price symbol volume timestamp}}`
export default compose(
    graphql(gqlQuery, {
        options(ownProps) {
            return {
                variables: {
                    symbols: ownProps.symbols
                },
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, stockData, refetch}}) => ({
            stockData,
            loading,
            refetch
        })
    })
)(StockTicker)




