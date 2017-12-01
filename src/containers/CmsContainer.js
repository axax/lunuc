import React from 'react'
import GenericForm from '../components/generic/GenericForm'
import Pagination from '../components/generic/Pagination'
import update from 'immutability-helper'
import genericComposer from './generic/genericComposer'

const CMS_PAGES_PER_PAGE = 10



class CmsContainer extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {cmsPages, loading} = this.props

        if (!cmsPages)
            return null


        const totalPages = Math.ceil(cmsPages.total / CMS_PAGES_PER_PAGE),
            currentPage = Math.ceil(cmsPages.offset / CMS_PAGES_PER_PAGE) + 1
        return (
            <div>
                <h1>Cms Pages</h1>
                <GenericForm fields={{slug:{value:'',placeholder:'slug name'}}} onClick={this.handleAddCmsPageClick} />

                <ul suppressContentEditableWarning={true}>
                    {(cmsPages.results ? cmsPages.results.map((cmsPage, i) => {
                        if( cmsPage ) {
                            return <li key={i}>
                            <span onBlur={(e) => this.handleCmsPageChange.bind(this)(e, cmsPage, 'slug')}
                                  suppressContentEditableWarning contentEditable>{cmsPage.slug}</span>
                                ({cmsPage.createdBy.username})
                                <button disabled={(cmsPage.status == 'deleting' || cmsPage.status == 'updating')}
                                        onClick={this.handleDeleteCmsPageClick.bind(this, cmsPage)}>X
                                </button>
                            </li>
                        }
                    }) : '')}
                </ul>
                <Pagination baseLink='/cms/' currentPage={currentPage} totalPages={totalPages}/>

            </div>
        )
    }


    handleAddCmsPageClick = (data) => {
        const {createCmsPage} = this.props
        createCmsPage(data)
    }

    handleCmsPageChange = (event, data, key) => {

        const t = event.target.innerText
        if (t != data[key]) {
            const {updateCmsPage} = this.props
            updateCmsPage(
                update(data, {[key]: {$set: t}})
            )
        }
    }

    handleDeleteCmsPageClick = (data) => {
        const {deleteCmsPage} = this.props
        deleteCmsPage({
            _id: data._id
        })
    }
}

export default genericComposer(CmsContainer, 'cmsPage', {fields: {'slug': 'String!'},limitPerPage:CMS_PAGES_PER_PAGE})

