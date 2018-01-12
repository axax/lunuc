import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'


const StockTicker = ({ticker, stockData}) => (
        <h2>{ticker} {stockData?stockData.price:'no price'}</h2>
)

StockTicker.propTypes = {
    ticker: PropTypes.string.isRequired,
    stockData: PropTypes.object,
    loading: PropTypes.bool
}



const gqlQuery=gql`query stockData($name: String!){ stockData(name: $name){price}}`
export default compose(
    graphql(gqlQuery, {
        options(ownProps) {
            return {
                variables: {
                    name:ownProps.ticker
                }
            }
        },
        props: ({data: {loading, stockData}}) => ({
            stockData,
            loading
        })
    })
)(StockTicker)




