import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {Card, Divider} from 'ui/admin'
import styles from './style.css'

class CurrencyTicker extends React.Component {

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
        if( !nextProps.currencyData || !this.props.currencyData ) return true

        return this.props.currencyData.rate!=nextProps.currencyData.rate
    }


    render() {
        const {currencyData} = this.props
        return <Card>{currencyData ?
            <div key={Math.random()} className="CurrencyTicker-highlight"><h2>{currencyData.from} / {currencyData.to}</h2>{currencyData.rate}</div> : 'no rate'}</Card>
    }
}

CurrencyTicker.propTypes = {
    from: PropTypes.string.isRequired,
    to: PropTypes.string.isRequired,
    currencyData: PropTypes.object,
    refetch: PropTypes.func,
    loading: PropTypes.bool
}


const gqlQuery = gql`query currencyData($from: String!, $to: String!){ currencyData(from: $from, to: $to){to from toName fromName rate timestamp}}`
export default compose(
    graphql(gqlQuery, {
        options(ownProps) {
            return {
                variables: {
                    from: ownProps.from,
                    to: ownProps.to
                },
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, currencyData, refetch}}) => ({
            currencyData,
            loading,
            refetch
        })
    })
)(CurrencyTicker)




