import React from 'react'
import PropTypes from 'prop-types'
import {Link} from 'react-router-dom'
import {Button} from './index'

const Pagination = ({onChangePage, baseLink, currentPage, totalPages}) => {

    if( totalPages<=1){
        return null
    }

    let pageFrom=0, pageTo=0
    if( totalPages>7 ){
        pageFrom = currentPage-3
        pageTo = currentPage+3
        if( pageFrom < 1){
            pageTo += Math.abs(pageFrom)+1
            pageFrom = 1
        }else if( pageTo>totalPages){
            pageFrom -= (pageTo-totalPages-1)
            pageTo = totalPages+1
        }
    }else{
        pageFrom=1
        pageTo=totalPages+1
    }

    const handleLinkClick  = (page) => (e) => {
        e.preventDefault()
        if( onChangePage ){
            onChangePage(page)
        }
    }

    if( baseLink ) {
        // Deprecated -> use onChangePage instead
        return <nav>
            <ul className="pagination">
                {currentPage > 1 ? <li><Link rel="first" to={baseLink + '1'}>First</Link></li> : ''}
                {currentPage > 1 ? <li><Link rel="prev" to={baseLink + (currentPage - 1)}>Previous</Link></li> : ''}

                {[...Array(pageTo - pageFrom)].map((_, i) => <li key={i}><Link
                    to={baseLink + (i + pageFrom)}>{i + pageFrom}</Link></li>)}

                {currentPage < totalPages ?
                    <li><Link rel="next" to={baseLink + (currentPage + 1)}>Next</Link></li> : ''}
                {currentPage < totalPages ? <li><Link rel="last" to={baseLink + totalPages}>Last</Link></li> : ''}

            </ul>
        </nav>
    }else{
        return <nav>
            <ul className="pagination">
                {currentPage > 1 ? <li><a href='' rel="first" onClick={handleLinkClick(1)}>First</a></li> : ''}
                {currentPage > 1 ? <li><a href='' rel="prev"  onClick={handleLinkClick(currentPage-1)}>Previous</a></li> : ''}

                {[...Array(pageTo - pageFrom)].map((_, i) => <li key={i}><a href=''
                                                                            onClick={handleLinkClick((i + pageFrom))}>{i + pageFrom}</a></li>)}

                {currentPage < totalPages ?
                    <li><a href='' rel="next" onClick={handleLinkClick(currentPage+1)}>Next</a></li> : ''}
                {currentPage < totalPages ? <li><a href='' rel="last" onClick={handleLinkClick(totalPages)}>Last</a></li> : ''}

            </ul>
        </nav>
    }
}

Pagination.propTypes = {
    baseLink: PropTypes.string,
    onChangePage: PropTypes.func,
    currentPage: PropTypes.number.isRequired,
    totalPages: PropTypes.number.isRequired
}

export default Pagination